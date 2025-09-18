import { Page, Layout, Text, Card, BlockStack, List } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <Page>
      <TitleBar title="International Quote Requests" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <BlockStack gap="200">
                <Text as="h2" variant="headingLg">
                  International Quote Requests
                </Text>
                <Text variant="bodyLg" as="p">
                  This app allows international customers to request quotes for
                  orders when shipping prices are variable and need to be
                  calculated based on destination, weight, and other factors.
                </Text>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  How it works
                </Text>
                <List>
                  <List.Item>
                    International customers can submit quote requests for their
                    orders
                  </List.Item>
                  <List.Item>
                    You can review and calculate accurate shipping costs
                  </List.Item>
                  <List.Item>
                    Provide custom quotes based on destination and package
                    details
                  </List.Item>
                  <List.Item>
                    Streamline the international order process
                  </List.Item>
                </List>
              </BlockStack>

              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Benefits
                </Text>
                <List>
                  <List.Item>
                    Accurate shipping cost calculation for international orders
                  </List.Item>
                  <List.Item>
                    Better customer experience with transparent pricing
                  </List.Item>
                  <List.Item>
                    Reduced cart abandonment from unexpected shipping costs
                  </List.Item>
                  <List.Item>
                    Streamlined quote and order management process
                  </List.Item>
                </List>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
