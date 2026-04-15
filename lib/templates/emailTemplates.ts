export interface EmailTemplate {
  key: string;
  label: string;
  subject: string;
  body: string;
}

export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    key: "restaurant_bar",
    label: "Restaurant / Bar",
    subject: "Local Dumpling Brand Looking to Partner - Radical Sasquatch",
    body: `Hey {{contactName}},

I work with Radical Sasquatch Dumpling Company, a Denver-based dumpling brand run out of Lakewood. We partner with bars and restaurants to offer a low-lift, high-margin food option - no kitchen required for most formats.

Would love to explore if there's a fit. Happy to drop off samples. Are you the right person to connect with on this?`,
  },
  {
    key: "brewery",
    label: "Brewery",
    subject: "Denver Dumpling Brand - Food Vendor Conversation",
    body: `Hey {{contactName}},

Reaching out on behalf of Radical Sasquatch Dumpling Company. We work with several Denver breweries that want to offer quality food without running a full kitchen. Local brand, easy to execute, solid margins.

Would love to bring you samples and talk through how it could work for {{accountName}}. Who handles vendor relationships on your end?`,
  },
  {
    key: "catering",
    label: "Catering",
    subject: "Radical Sasquatch - Dumpling Catering for Events and Corporate",
    body: `Hey {{contactName}},

I work with Radical Sasquatch Dumpling Company out of Denver. We do catering for corporate events, private events, and venue partnerships. Handmade dumplings, multiple flavors, easy to scale.

Would love to learn more about {{accountName}}'s event programming and see if there's a fit.`,
  },
];

export function resolveTemplate(
  template: EmailTemplate,
  vars: { contactName: string; accountName: string }
): { subject: string; body: string } {
  const replace = (text: string) =>
    text
      .replace(/\{\{contactName\}\}/g, vars.contactName || "there")
      .replace(/\{\{accountName\}\}/g, vars.accountName || "your venue");

  return {
    subject: replace(template.subject),
    body: replace(template.body),
  };
}
