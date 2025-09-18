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
 * @returns {Promise<Object>} - The draft order creation result
 */
async function createDraftOrder(admin) {
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
      email: "customer@example.com",
      shippingAddress: {
        address1: "123 Main St",
        city: "Springfield",
        province: "Illinois",
        country: "United States",
        zip: "62704",
      },
      lineItems: [
        {
          variantId: "gid://shopify/ProductVariant/49457743036715",
          quantity: 1,
        },
      ],
      tags: ["VIP", "PhoneOrder"],
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

export const loader = async ({ request, params }) => {
  const url = new URL(request.url);
  const path = params["*"] || "";

  // Get query parameters
  const searchParams = url.searchParams;

  console.log(`[PROXY] GET request received:`, {
    path,
    shop: searchParams.get("shop"),
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get("user-agent"),
  });

  // Verify the request comes from Shopify
  const sharedSecret = process.env.SHOPIFY_API_SECRET;
  const isVerified = verifyShopifyRequest(searchParams, sharedSecret);

  console.log(`[PROXY] Signature verification result:`, {
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

  // Create draft order when request is verified
  let draftOrderResult = null;
  try {
    const shop = searchParams.get("shop");
    if (shop) {
      console.log(`[DRAFT_ORDER] Creating draft order for shop: ${shop}`);

      // Use unauthenticated method for proxy routes
      const { admin } = await unauthenticated.admin(shop);

      // Create the draft order
      const draftOrderResponse = await createDraftOrder(admin);
      draftOrderResult = draftOrderResponse;

      console.log(`[DRAFT_ORDER] Draft order created successfully:`, {
        draftOrderId: draftOrderResponse.data?.draftOrderCreate?.draftOrder?.id,
        status: draftOrderResponse.data?.draftOrderCreate?.draftOrder?.status,
        userErrors: draftOrderResponse.data?.draftOrderCreate?.userErrors,
      });
    }
  } catch (error) {
    console.error(`[DRAFT_ORDER] Failed to create draft order:`, error);
    draftOrderResult = {
      error: error.message,
      success: false,
    };
  }

  // Create a test response with draft order data
  const testData = {
    message: "App proxy is working!",
    timestamp: new Date().toISOString(),
    path: path,
    queryParams: Object.fromEntries(searchParams),
    shop: searchParams.get("shop") || "unknown",
    host: url.host,
    userAgent: request.headers.get("user-agent") || "unknown",
    verified: true,
    draftOrder: draftOrderResult,
  };

  return json(testData, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};

export const action = async ({ request, params }) => {
  const url = new URL(request.url);
  const path = params["*"] || "";

  console.log(`[PROXY] POST request received:`, {
    path,
    shop: url.searchParams.get("shop"),
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get("user-agent"),
  });

  // Verify the request comes from Shopify
  const sharedSecret = process.env.SHOPIFY_API_SECRET;
  const isVerified = verifyShopifyRequest(url.searchParams, sharedSecret);

  console.log(`[PROXY] Signature verification result:`, {
    verified: isVerified,
    shop: url.searchParams.get("shop"),
    hasSignature: !!url.searchParams.get("signature"),
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

  // Create draft order when request is verified
  let draftOrderResult = null;
  try {
    const shop = url.searchParams.get("shop");
    if (shop) {
      console.log(`[DRAFT_ORDER] Creating draft order for shop: ${shop}`);

      // Use unauthenticated method for proxy routes
      const { admin } = await unauthenticated.admin(shop);

      // Create the draft order
      const draftOrderResponse = await createDraftOrder(admin);
      draftOrderResult = draftOrderResponse;

      console.log(`[DRAFT_ORDER] Draft order created successfully:`, {
        draftOrderId: draftOrderResponse.data?.draftOrderCreate?.draftOrder?.id,
        status: draftOrderResponse.data?.draftOrderCreate?.draftOrder?.status,
        userErrors: draftOrderResponse.data?.draftOrderCreate?.userErrors,
      });
    }
  } catch (error) {
    console.error(`[DRAFT_ORDER] Failed to create draft order:`, error);
    draftOrderResult = {
      error: error.message,
      success: false,
    };
  }

  // Handle POST requests
  const formData = await request.formData();
  const body = Object.fromEntries(formData);

  const testData = {
    message: "App proxy POST is working!",
    timestamp: new Date().toISOString(),
    path: path,
    method: "POST",
    body: body,
    shop: url.searchParams.get("shop") || "unknown",
    verified: true,
    draftOrder: draftOrderResult,
  };

  return json(testData, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
