import { json } from "@remix-run/node";
import crypto from "crypto";
import { unauthenticated } from "../shopify.server";

/**
 * Verifies that a request comes from Shopify by validating the signature
 * @param {URLSearchParams} searchParams - The query parameters from the request
 * @param {string} sharedSecret - The app's shared secret
 * @returns {boolean} - True if the request is verified, false otherwise
 */
function verifyShopifyRequest(searchParams, sharedSecret) {
  if (!sharedSecret) {
    console.warn(
      "SHOPIFY_API_SECRET not configured - skipping signature verification",
    );
    return false;
  }

  const signature = searchParams.get("signature");
  if (!signature) {
    console.log(`[VERIFY] No signature parameter found in request`);
    return false;
  }

  // Create a copy of searchParams without the signature
  const params = new URLSearchParams(searchParams);
  params.delete("signature");

  // Sort parameters alphabetically by key
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("");

  // Compute HMAC-SHA256 signature
  const computedSignature = crypto
    .createHmac("sha256", sharedSecret)
    .update(sortedParams)
    .digest("hex");

  const isValid = computedSignature === signature;

  console.log(`[VERIFY] Signature verification details:`, {
    receivedSignature: signature,
    computedSignature: computedSignature,
    sortedParams: sortedParams,
    isValid: isValid,
  });

  return isValid;
}

/**
 * Creates a draft order using the Shopify GraphQL API
 * @param {Object} admin - The Shopify admin GraphQL client
 * @param {Object} orderData - The parsed order data from the payload
 * @returns {Promise<Object>} - The draft order creation result
 */
async function createDraftOrder(admin, orderData) {
  const DRAFT_ORDER_MUTATION = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          invoiceUrl
          status
          lineItems(first: 5) {
            edges {
              node {
                title
                quantity
                variant {
                  id
                  price
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      email: orderData.email,
      shippingAddress: {
        address1: orderData.shipping_address1,
        city: orderData.shipping_city,
        province: orderData.shipping_province,
        country: orderData.shipping_country,
        zip: orderData.shipping_zip,
      },
      lineItems: orderData.lineItems,
      tags: ["International-Quote"],
    },
  };

  try {
    const response = await admin.graphql(DRAFT_ORDER_MUTATION, { variables });
    return response;
  } catch (error) {
    console.error("[DRAFT_ORDER] Error creating draft order:", error);
    throw error;
  }
}

/**
 * Parse order data from the payload
 * @param {Object} payload - The request payload
 * @returns {Object} - Parsed order data
 */
function parseOrderData(payload) {
  // Extract customer information - handle both quote[] and contact[] prefixes
  const orderData = {
    email: payload["quote[email]"],
    full_name: payload["quote[full_name]"],
    shipping_address1: payload["quote[shipping_address1]"],
    shipping_city: payload["quote[shipping_city]"],
    shipping_province: payload["quote[shipping_province]"],
    shipping_country: payload["quote[shipping_country]"],
    shipping_zip: payload["quote[shipping_zip]"],
    cart: payload["quote[Cart]"],
    cart_line_items: payload["quote[cart_line_items]"],
    cart_total: payload["quote[cart_total]"],
  };

  // Parse cart line items from JSON if available
  if (orderData.cart_line_items) {
    try {
      const lineItems = JSON.parse(orderData.cart_line_items);
      orderData.lineItems = lineItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      }));
    } catch (error) {
      console.warn("[ORDERS] Failed to parse cart_line_items JSON:", error);
      // Fall back to cart text parsing
      orderData.lineItems = parseCartText(orderData.cart);
    }
  } else if (orderData.cart) {
    // Fall back to parsing cart text
    orderData.lineItems = parseCartText(orderData.cart);
  }

  return orderData;
}

/**
 * Parse cart text to extract line items
 * @param {string} cartText - The cart text content
 * @returns {Array} - Array of line items
 */
function parseCartText(cartText) {
  if (!cartText) return [];

  const cartLines = cartText
    .split("\n")
    .filter((line) => line.includes("×") && line.includes("$"));

  return cartLines.map((line, index) => {
    const quantityMatch = line.match(/(\d+)\s*×/);
    const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;

    return {
      variantId: `gid://shopify/ProductVariant/49457743036715`, // Default variant ID
      quantity: quantity,
    };
  });
}

export const action = async ({ request }) => {
  const url = new URL(request.url);

  console.log(`[ORDERS] POST request received at:`, new Date().toISOString());

  // Get query parameters for signature verification
  const searchParams = url.searchParams;

  console.log(`[ORDERS] Request details:`, {
    shop: searchParams.get("shop"),
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get("user-agent"),
  });

  // Verify the request comes from Shopify
  const sharedSecret = process.env.SHOPIFY_API_SECRET;
  const isVerified = verifyShopifyRequest(searchParams, sharedSecret);

  console.log(`[ORDERS] Signature verification result:`, {
    verified: isVerified,
    shop: searchParams.get("shop"),
    hasSignature: !!searchParams.get("signature"),
    hasSecret: !!sharedSecret,
  });

  if (!isVerified) {
    return json(
      {
        error: "Unauthorized",
        message: "Request signature verification failed",
      },
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    // Get the request body
    const contentType = request.headers.get("content-type");
    let payload;

    if (contentType?.includes("application/json")) {
      payload = await request.json();
    } else if (contentType?.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      payload = Object.fromEntries(formData);
    } else {
      // Try to get as text
      payload = await request.text();
    }

    // Log the payload
    console.log(`[ORDERS] Payload received:`, {
      contentType,
      payload,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get("user-agent"),
      contentLength: request.headers.get("content-length"),
    });

    // Parse order data from payload
    const orderData = parseOrderData(payload);
    console.log(`[ORDERS] Parsed order data:`, orderData);

    // Create draft order
    let draftOrderResult = null;
    try {
      // Get shop from verified query parameters
      const shop = searchParams.get("shop");

      if (shop) {
        console.log(`[ORDERS] Creating draft order for shop: ${shop}`);

        // Use unauthenticated method for external requests
        const { admin } = await unauthenticated.admin(shop);

        // Create the draft order
        const draftOrderResponse = await createDraftOrder(admin, orderData);
        draftOrderResult = draftOrderResponse;

        console.log(`[ORDERS] Draft order created successfully:`, {
          draftOrderId:
            draftOrderResponse.data?.draftOrderCreate?.draftOrder?.id,
          status: draftOrderResponse.data?.draftOrderCreate?.draftOrder?.status,
          invoiceUrl:
            draftOrderResponse.data?.draftOrderCreate?.draftOrder?.invoiceUrl,
          userErrors: draftOrderResponse.data?.draftOrderCreate?.userErrors,
        });
      } else {
        console.warn(
          `[ORDERS] No shop parameter found, skipping draft order creation`,
        );
      }
    } catch (error) {
      console.error(`[ORDERS] Failed to create draft order:`, error);
      draftOrderResult = {
        error: error.message,
        success: false,
      };
    }

    // Return success response with draft order info
    return json(
      {
        success: true,
        message: "Order payload received and draft order created",
        timestamp: new Date().toISOString(),
        orderData: orderData,
        draftOrder: draftOrderResult,
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error(`[ORDERS] Error processing request:`, error);

    return json(
      {
        success: false,
        error: "Failed to process order payload",
        message: error.message,
      },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
};

// Handle OPTIONS requests for CORS
export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  return json(
    {
      message: "Orders endpoint - use POST to send order data",
      method: "POST",
    },
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
};
