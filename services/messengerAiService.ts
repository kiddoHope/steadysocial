import { CustomerDetails, CustomerStatus, Sentiment } from './chatDbService';

export interface ChatMessage {
  id: string;
  created_time: string;
  message?: string;
  from: {
    id: string;
    name: string;
    email?: string;
  };
  attachments?: {
    data: Array<{
      image_data?: {
        url: string;
      };
    }>;
  };
}

// --- Keyword Helper ---
const simpleExtractKeywords = (text: string): string[] => {
  const stopWords = new Set([
    'a', 'an', 'the', 'po', 'opo', 'magkano', 'mgkano', 'ako', 'ikaw', 'siya', 
    'nito', 'namin', 'inyo', 'kanila', 'and', 'is', 'are', 'in', 'on', 'at', 
    'ng', 'mga', 'ang', 'sa', 'for', 'i', 'you', 'he', 'she', 'it', 'we', 
    'they', 'what', 'who', 'where', 'when', 'why', 'how', 'to', 'do', 'have', 
    'ako', 'po', 'ba', 'meron'
  ]);
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
};

export const extractKeywords = async (
  text: string,
  callAI: (messages: any[]) => Promise<string>
): Promise<string[]> => {
  if (!text.trim()) {
    return [];
  }

  const systemPrompt = `You are a highly efficient keyword extraction tool for an e-commerce chatbot in the Philippines. Your task is to analyze the user's message and extract only the most important keywords related to products, product types, or user concerns (e.g., 'acne', 'whitening').

**Instructions:**
1.  Read the user's message carefully. The language will likely be Taglish (Tagalog-English mix).
2.  Identify words that directly name a product ('rejuv set', 'toner', 'serum'), describe a product type, or state a problem ('pimples', 'dark spots').
3.  Ignore common conversational filler, greetings, and stop words like 'po', 'magkano', 'how much', 'do you have'.
4.  Return the extracted keywords as a JSON object with a single key "keywords", which is an array of strings. All keywords should be lowercase.
5.  If no relevant keywords are found, return an empty array: \`{ "keywords": [] }\`.
6.  You MUST respond with ONLY the valid JSON object. Do not include any other text, explanations, or markdown formatting.

**Example 1:**
User Message: "mgkano po rejuv set ninyo?"
Your Response: { "keywords": ["rejuv", "set"] }

**Example 2:**
User Message: "Hi, do you have a toner for acne?"
Your Response: { "keywords": ["toner", "acne"] }

**Example 3:**
User Message: "hello po available pa po ba yung Niacinamide + Hyaluronic Acid Serum"
Your Response: { "keywords": ["niacinamide", "hyaluronic", "acid", "serum"] }
`;

  try {
    const response = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ]);

    const cleaned = response.trim();
    const startIndex = cleaned.indexOf('{');
    const endIndex = cleaned.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1) {
      throw new Error('JSON not found');
    }
    const jsonString = cleaned.substring(startIndex, endIndex + 1);
    const parsedJson = JSON.parse(jsonString);

    if (Array.isArray(parsedJson.keywords)) {
      return parsedJson.keywords;
    }
    throw new Error('Invalid structure');
  } catch (error) {
    console.warn('AI keyword extraction failed, falling back to simple method.', error);
    return simpleExtractKeywords(text);
  }
};

// --- Product Filtering ---
export interface ProductDetail {
  name: string;
  category: string;
  size?: string;
  sku?: string;
  brand?: string;
  price?: number | string;
}

export const filterProductDetailsByKeywords = (keywords: string[], allProducts: any): ProductDetail[] => {
  if (keywords.length === 0 || !allProducts?.product_categories) {
    return [];
  }

  const matched: ProductDetail[] = [];
  const lowercasedKeywords = keywords.map(k => k.toLowerCase());

  for (const category of allProducts.product_categories) {
    const categoryName = category.category_name;
    const categoryNameLower = categoryName.toLowerCase();
    
    for (const product of category.products) {
      const productName = product.product_name;
      const productNameLower = productName.toLowerCase();

      const isMatch = lowercasedKeywords.some(keyword =>
        productNameLower.includes(keyword) || categoryNameLower.includes(keyword)
      );

      if (isMatch) {
        matched.push({
          name: productName,
          category: categoryName,
          size: product.size,
          sku: product.sku,
          brand: product.brand,
          price: product.pricing?.srp,
        });
      }
    }
  }

  return matched;
};

export const filterProductsByKeywords = (keywords: string[], allProducts: any): string[] => {
  if (keywords.length === 0 || !allProducts?.product_categories) {
    return [];
  }

  const matchedProducts = new Set<string>();
  const lowercasedKeywords = keywords.map(k => k.toLowerCase());

  for (const category of allProducts.product_categories) {
    const categoryNameLower = category.category_name.toLowerCase();
    for (const product of category.products) {
      const productNameLower = product.product_name.toLowerCase();

      const isMatch = lowercasedKeywords.some(keyword =>
        productNameLower.includes(keyword) || categoryNameLower.includes(keyword)
      );

      if (isMatch) {
        matchedProducts.add(product.product_name);
      }
    }
  }

  return Array.from(matchedProducts);
};

// --- Message Format ---
const formatMessagesForAI = (
  messages: ChatMessage[],
  pageId: string,
  limit?: number
): Array<{ role: 'user' | 'assistant'; content: string }> => {
  let messageSet = messages.filter(msg => msg && msg.from);

  if (limit) {
    messageSet = messageSet.slice(-limit); // Keep the most recent messages up to the limit
  }

  return messageSet.map(msg => {
    let contentText = msg.message || '';

    if (msg.attachments?.data?.length) {
      const hasImage = msg.attachments.data.some(att => att.image_data);
      const attachmentText = hasImage ? '[User sent an image]' : '[User sent an attachment]';

      if (contentText) {
        contentText += ` ${attachmentText}`;
      } else {
        contentText = attachmentText;
      }
    }

    const role: 'user' | 'assistant' = String(msg.from.id) === String(pageId) ? 'assistant' : 'user';

    return {
      role,
      content: contentText.trim(),
    };
  }).filter(msg => msg.content);
};

// --- System Instruction Creators ---
const formatAllProductsSummary = (allProducts: any): string => {
  if (!allProducts || !Array.isArray(allProducts.product_categories) || allProducts.product_categories.length === 0) {
    return 'No products loaded in the catalog.';
  }

  let summary = '';
  for (const category of allProducts.product_categories) {
    const categoryName = category.category_name || 'Uncategorized';
    summary += `Category: ${categoryName}\n`;
    
    if (Array.isArray(category.products)) {
      for (const product of category.products) {
        const name = product.product_name || 'Unnamed Product';
        const size = product.size ? ` (${product.size})` : '';
        const price = product.pricing?.srp ? ` - ₱${product.pricing.srp}` : '';
        const brand = product.brand ? ` [Brand: ${product.brand}]` : '';
        summary += `- ${name}${size}${price}${brand}\n`;
      }
    }
    summary += '\n';
  }
  return summary.trim();
};

const createBusinessSystemInstruction = (businessInfo: any, allProducts: any): string => {
  const businessName = businessInfo?.businessInfo?.name || 'the company';
  const shippingInfo = businessInfo?.businessInfo?.shippingInfo || 'Flat rate delivery';
  const paymentInfo = businessInfo?.businessInfo?.paymentInfo || 'GCash or BDO transfer';
  const productsList = formatAllProductsSummary(allProducts);

  return `
You are a Personal Assistant, a top-tier digital sales assistant for *${businessName}*. Your persona is modern, extremely friendly, professional, and helpful.

Your main goal is to answer general business questions, inform customers about available products/scents in our catalog, and guide them smoothly towards making a purchase.

**Language:**
- Communicate in a warm, helpful, and clear *Taglish* (a natural blend of Tagalog and English). Use friendly emojis! 😊

**CRITICAL RULES:**
1. **STICK TO BUSINESS DATA:** Answer questions about shipping, payment, and business details using *only* the provided **BUSINESS DATA** context:
   - Shipping Policy: *${shippingInfo}*
   - Payment Details: *${paymentInfo}*
2. **DISCOUNTS AND PROMOS:** If the user asks about *discounts*, *promos*, *sales*, or *special offers*, you **MUST NOT** answer directly. Politely state that you do not have the most up-to-date information on promos and will connect them with a human agent. After your polite message, append the \`[HANDOFF]\` tag.
3. **PRODUCTS CATALOG:** You have access to our **ALL PRODUCTS CATALOG**. If the customer asks what products we sell, what scents/options are available, or asks for recommendations, you **CAN AND SHOULD** reference the **ALL PRODUCTS CATALOG** to tell them what categories, products, or scents we have! Never make up products not listed in the catalog.
4. **ORDER PROCESSING & CHECKOUT:**
   - If the customer wants to buy, place an order, or checkout, you MUST guide them to provide their order details using the exact format below.
   - You MUST ask for all of the following details:
     - Full Name (Fullname)
     - Contact details (Both Email and Contact Number)
     - Product they want (Orders)
     - Payment method they want to use (from our options: *${paymentInfo}*)
     - Shipping method they want (from our options: *${shippingInfo}*)
     - Shipping Address (Shipping Address)
     - Payment proof (receipt, slip, or screenshot once paid)
   - You MUST display the blank or partially filled form template below for them to fill:
     
     Fullname:
     Contact Details:
     Orders:
     Payment Method:
     Shipping Method:
     Shipping Address:
     
   - Once they have completed these details and stated that payment is done or proof of payment is sent, you MUST thank them, let them know a human agent will verify it, and you MUST append the \`[HANDOFF]\` tag.
5. **ALWAYS BE CLOSING (ABC):** End your replies with a friendly question or next step to keep the conversation moving. For example, "Ready ka na po bang umorder?" or "May iba pa po ba akong pwedeng i-assist sa'yo?"

**BUSINESS DATA:**
\`\`\`json
${JSON.stringify(businessInfo || {})}
\`\`\`

**ALL PRODUCTS CATALOG:**
${productsList}
`;
};

const createProductSystemInstruction = (
  matchedProducts: ProductDetail[],
  userQuery: string,
  businessInfo: any
): string => {
  const businessName = businessInfo?.businessInfo?.name || 'the company';
  const shippingInfo = businessInfo?.businessInfo?.shippingInfo || 'Flat rate delivery';
  const paymentInfo = businessInfo?.businessInfo?.paymentInfo || 'GCash or Bank transfer';

  return `
You are a Personal Assistant, a helpful and friendly digital sales assistant and product finder for *${businessName}*.

Your main goal is to identify products the customer is interested in, answer details about them (such as price, brand, size), and guide them to order using the provided **PRODUCTS DATA** and **BUSINESS DATA**.

**Language:**
- Communicate using warm, polite, and helpful *Taglish* with emojis. 😊

**Key Guidelines:**
1. **PRODUCT ENQUIRIES & PRICING:**
   - You **ARE ALLOWED AND ENCOURAGED** to answer factual questions (price, size, brand, SKU) directly based ONLY on the **PRODUCTS DATA** list below!
   - Highlight sizes and prices. E.g., "The *Ultra Hydrating Niacinamide Serum (30ml)* is *₱299.00* po! 💖"
   
2. **HANDLING AMBIGUITY:**
   - If the user's query is vague (e.g., "magkano serum", "what items do you have?") and the matched products list contains *more than one item*, **ask for clarification**. Do not hand off yet.
   - List the matching products and ask them which one they'd like.
   - **Example Response:** "We have a few options for serum. Which one are you interested in? 😊\\n- Ultra Hydrating Niacinamide Serum\\n- Gentle Retinol Serum"
   
3. **ORDER PROCESSING & CHECKOUT:**
   - If the customer wants to buy, place an order, or checkout, you MUST guide them to provide their order details using the exact format below.
   - You MUST ask for all of the following details:
     - Full Name (Fullname)
     - Contact details (Both Email and Contact Number)
     - Product they want (Orders)
     - Payment method they want to use (from our options: *${paymentInfo}*)
     - Shipping method they want (from our options: *${shippingInfo}*)
     - Shipping Address (Shipping Address)
     - Payment proof (receipt, slip, or screenshot once paid)
   - You MUST display the blank or partially filled form template below for them to fill:
     
     Fullname:
     Contact Details:
     Orders:
     Payment Method:
     Shipping Method:
     Shipping Address:
     
   - Once they have completed these details and stated that payment is done or proof of payment is sent, you MUST thank them, let them know a human agent will verify it, and you MUST append the \`[HANDOFF]\` tag.

4. **MISSING PRODUCTS / COMPLEX DETAILS:**
   - If the user asks about a product, specific ingredients, or claims that are **NOT** present in the provided **PRODUCTS DATA** list, DO NOT make things up.
   - Acknowledge their question, politely state that you will check the exact details with our team, and append the **[HANDOFF]** tag.
   - **Example Response:** "Sandali lang po, let me connect you to a human agent to check the exact stock and ingredients for you! [HANDOFF]"

**BUSINESS DATA:**
\`\`\`json
${JSON.stringify(businessInfo || {})}
\`\`\`

**PRODUCTS DATA (Relevant matches for customer query):**
\`\`\`json
${JSON.stringify(matchedProducts)}
\`\`\`
`;
};

const createFollowUpSystemInstruction = (businessInfo: any, allProducts: any, tone: string = 'warm'): string => {
  const businessName = businessInfo?.businessInfo?.name || 'the company';
  const productsList = formatAllProductsSummary(allProducts);

  return `
You are a Personal Assistant, a friendly customer care assistant for *${businessName}*.

Your task is to draft a polite, warm, and highly personalized follow-up message to re-engage a customer after a period of silence.

**Language:**
- Use a natural, gentle, and enthusiastic *Taglish* tone with emojis. Huwag mag-tunog robot!

**Follow-up Style/Tone Context:**
- Selected Follow-up Tone: *${tone}*

**Instructions:**
- **Analyze Context:** Review the recent chat history to see what was last discussed (e.g. a product, price, payment, shipping, skin concern).
- **Craft Your Message:** Write a short, friendly, and natural-sounding follow-up. Do not sound pushy.
- **Reference Catalog if Relevant:** If you need to remind them of our products, categories, or scents, reference the **ALL PRODUCTS CATALOG**.
- **End with a Question:** Always end your message with a simple, open-ended question to make it easy for them to reply (e.g., checking back if they had a chance to decide, or if there's anything else you can help with).
- **Format for Messenger:** Use *bold* for product names or key terms. Use bullet points if listing options.

**System Directives (Internal Use Only):**
- Use the "[HANDOFF]" tag only if you review the chat and determine a human agent's intervention is absolutely necessary.

**ALL PRODUCTS CATALOG:**
${productsList}
`;
};

// --- Main AI Reply Function ---
export const generateAutoReply = async (
  messages: ChatMessage[],
  pageId: string,
  isFollowUp: boolean = false,
  remarks: string = '',
  callAI: (messages: any[], stream?: boolean, onChunk?: any) => Promise<string>,
  businessInfo: any,
  allProducts: any,
  followUpTone: string = 'warm'
): Promise<{ reply: string; handoff: boolean }> => {
  if (messages.length === 0) {
    return {
      reply: "Thank you for your message. We'll get back to you as soon as possible.",
      handoff: true,
    };
  }

  const businessName = businessInfo?.businessInfo?.name || 'our business';
  let systemPromptContent: string;
  const latestMessage = messages[messages.length - 1]; // chronologically last (most recent)

  if (!latestMessage) {
    return { reply: 'Thank you for contacting us. We will get back to you shortly.', handoff: true };
  }

  const lastUserMessage = latestMessage.message || '';
  const lowercasedMessage = lastUserMessage.toLowerCase();

  // Payment Notification Safety Rule Detection
  const paymentKeywords = [
    'paid', 'payment', 'sent payment', 'payment sent',
    'bayad na', 'nagbayad na', 'nabayaran ko na',
    'resibo', 'receipt', 'proof of payment', 'transaction slip', 'payment slip'
  ];
  const isPaymentMessage = paymentKeywords.some(keyword => lowercasedMessage.includes(keyword));

  if (isFollowUp) {
    systemPromptContent = createFollowUpSystemInstruction(businessInfo, allProducts, followUpTone);
  } else {
    // Promos / Discounts Safety Rule Interception
    const promoKeywords = [
      'promo', 'discount', 'sale', 'offer', 'special price', 'deal', 'deals',
      'diskwento', 'tawad', 'bawas', 'less'
    ];
    const isPromoMessage = promoKeywords.some(keyword => lowercasedMessage.includes(keyword));

    if (isPromoMessage) {
      const replyMessage = `That's a great question! For the latest and most accurate information on our current discounts and promos, let me connect you with one of our team members who can best assist you.`;
      return { reply: replyMessage, handoff: true };
    }

    // Keyword Extraction & Prompt Routing
    const keywords = await extractKeywords(lastUserMessage, callAI);
    const matchedProductDetails = filterProductDetailsByKeywords(keywords, allProducts);

    if (matchedProductDetails.length > 0) {
      systemPromptContent = createProductSystemInstruction(matchedProductDetails, lastUserMessage, businessInfo);
    } else {
      systemPromptContent = createBusinessSystemInstruction(businessInfo, allProducts);
    }
  }

  // Prepend critical action directive if payment is mentioned
  if (isPaymentMessage) {
    systemPromptContent += `\n\n**CRITICAL ACTION DIRECTIVE:** The customer has indicated they made a payment, sent a receipt, or that payment is done. You MUST thank them politely, check if they have provided all of the following order details, and ask them for any missing fields using the template format below.
Required template format:
Fullname:
Contact Details:
Orders:
Payment Method:
Shipping Method:
Shipping Address:

You MUST also ask them to provide/upload their Payment Proof (receipt or slip) if not already sent.
Finally, you MUST append the \`[HANDOFF]\` tag at the absolute end of your response to deactivate autopilot so human agents can verify the transaction.`;
  }

  // Prepend agent remarks if active
  if (remarks) {
    systemPromptContent += `\n\n**IMPORTANT AGENT REMARKS:**\nYou must consider these remarks from the human agent as high-priority context for your response. These remarks override any general instructions if there is a conflict.\n\`\`\`\n${remarks}\n\`\`\``;
  }

  const formattedMessages = formatMessagesForAI(messages, pageId, 10);

  if (formattedMessages.length === 0) {
    return { reply: 'Our team will get back to you shortly.', handoff: true };
  }

  const chatMessages = [
    { role: 'system', content: systemPromptContent },
    ...formattedMessages,
  ];

  try {
    const response = await callAI(chatMessages);
    let reply = response.trim();
    let handoff = false;

    if (!reply) {
      return { reply: 'Thank you for contacting us. We will get back to you shortly.', handoff: true };
    }

    if (reply.includes('[HANDOFF]') || isPaymentMessage) {
      handoff = true;
    }

    // Clean internal tags
    const cleanedReply = reply.replace(/\[.*?\]/g, '').trim();

    // Mandatory Disclaimer with Business Name
    const finalReply = `Hi, I'm your Personal Assistant from *${businessName}*. Please be advised that my response may not be entirely accurate or up-to-date.\n\n${cleanedReply}`;

    return { reply: finalReply, handoff };
  } catch (error) {
    console.error('Error generating auto-reply with AI:', error);
    return { reply: 'Thank you for contacting us. Our team will get back to you shortly.', handoff: true };
  }
};

export interface ExtractedCustomerProfile extends CustomerDetails {
  tags?: string[];
  remarks?: string;
}

// --- Customer Details Extractor ---
export const extractCustomerDetailsFromChat = async (
  messages: ChatMessage[],
  pageId: string,
  callAI: (messages: any[]) => Promise<string>
): Promise<ExtractedCustomerProfile> => {
  const systemPrompt = `
You are an expert data extraction assistant. Your task is to analyze the provided chat history transcript and extract the customer's profile, contact details, tags, and agent remarks into a structured JSON format.

**Instructions:**
1.  Read the conversation transcript carefully to find the most recently provided and complete details.
2.  Identify the customer's full name, contact number (mobile or landline), email address, and complete shipping address.
3.  Generate relevant short descriptive tags for the conversation (e.g., VIP, hot_lead, skincare, inquiry, ordering, paid, etc.) based on their behavior, interest, and transaction state. Return these as an array of strings in "tags".
4.  Summarize the customer's current inquiries, orders, preferences, or special notes in a concise sticky note format (e.g., "Interested in Ultra Hydrating Serum. Prefers GCash payment.") for the human agent. Return this in "remarks".
5.  If a piece of information is not present or cannot be determined from the conversation, the value for that key should be an empty string "" or an empty array [].
6.  You **MUST** respond with **ONLY** a valid JSON object. Do not include any other text, greetings, explanations, or markdown formatting like \`\`\`json. Your entire response should be the JSON object itself.

**JSON Output Schema:**
{
  "fullName": "string",
  "contactNumber": "string",
  "email": "string",
  "address": "string",
  "tags": ["string"],
  "remarks": "string"
}
`;

  const formattedLines = messages
    .filter(msg => msg && msg.from && (msg.message || msg.attachments?.data?.length))
    .map(msg => {
      const sender = String(msg.from.id) === String(pageId) ? 'Agent' : 'Customer';
      let content = msg.message || '';
      if (msg.attachments?.data?.length) {
        content += ' [Attachment/Image]';
      }
      return `${sender}: ${content}`;
    });

  if (formattedLines.length === 0) {
    throw new Error('Cannot extract details from an empty conversation.');
  }

  const conversationTranscript = formattedLines.join('\n');

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Here is the conversation transcript to analyze:\n\n=== CONVERSATION START ===\n${conversationTranscript}\n=== CONVERSATION END ===\n\nAnalyze the transcript above and extract the customer profile details, tags, and agent remarks into the exact JSON format requested. Do not reply to the Customer. Only output the JSON object.`,
    },
  ];

  try {
    const response = await callAI(chatMessages);
    const cleaned = response.trim();
    const startIndex = cleaned.indexOf('{');
    const endIndex = cleaned.lastIndexOf('}');

    if (startIndex === -1 || endIndex === -1) {
      return { fullName: '', contactNumber: '', email: '', address: '', tags: [], remarks: '' };
    }

    const cleanedJsonString = cleaned.substring(startIndex, endIndex + 1);
    const parsedJson = JSON.parse(cleanedJsonString);

    return {
      fullName: parsedJson.fullName || '',
      contactNumber: parsedJson.contactNumber || '',
      email: parsedJson.email || '',
      address: parsedJson.address || '',
      tags: parsedJson.tags || [],
      remarks: parsedJson.remarks || '',
    };
  } catch (error) {
    console.error('Error extracting customer details with AI:', error);
    return { fullName: '', contactNumber: '', email: '', address: '', tags: [], remarks: '' };
  }
};

// --- Sentiment Analyzer ---
export const detectSentimentFromChat = async (
  messages: ChatMessage[],
  pageId: string,
  callAI: (messages: any[]) => Promise<string>
): Promise<Sentiment | undefined> => {
  const systemPrompt = `
You are an expert sentiment analysis tool for customer service conversations. Your task is to analyze the provided chat history and determine the customer's final, overall sentiment by the end of the interaction.

**Instructions:**
1.  Focus primarily on the messages from the 'user' (the customer) to determine their final sentiment.
2.  Analyze the customer's tone, politeness, expression of satisfaction or frustration, and use of emotive language throughout the entire conversation.
3.  Determine if the overall sentiment is 'positive', 'neutral', or 'negative'.
4.  You **MUST** respond with **ONLY** a single, valid JSON object.
5.  Do **NOT** include any other text, greetings, explanations, or markdown formatting like \`\`\`json. Your entire response must be the JSON object itself.

**Example of your required output:**
{
  "sentiment": "positive"
}
`;

  const formattedMessages = formatMessagesForAI(messages, pageId, 30);

  if (formattedMessages.length === 0) {
    return undefined;
  }

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...formattedMessages,
  ];

  try {
    const response = await callAI(chatMessages);
    const cleaned = response.trim();
    const startIndex = cleaned.indexOf('{');
    const endIndex = cleaned.lastIndexOf('}');

    if (startIndex === -1 || endIndex === -1) {
      return undefined;
    }

    const cleanedJsonString = cleaned.substring(startIndex, endIndex + 1);
    const parsedJson = JSON.parse(cleanedJsonString);
    const sentiment = parsedJson.sentiment;

    if (sentiment === 'positive' || sentiment === 'neutral' || sentiment === 'negative') {
      return sentiment as Sentiment;
    }
    return undefined;
  } catch (error) {
    console.error('Error calling AI for sentiment detection:', error);
    return undefined;
  }
};

// --- CRM Funnel Tracker with Anti-Downgrade Safeguards ---
const STATUS_HIERARCHY: CustomerStatus[] = ['New', 'Inquiry', 'Ordering', 'Paid', 'Shipped', 'Completed'];

export const determineCustomerStatusFromChat = async (
  messages: ChatMessage[],
  pageId: string,
  currentStatus: CustomerStatus
): Promise<CustomerStatus> => {
  const userMessages = messages
    .filter(m => String(m.from.id) !== String(pageId) && m.message)
    .slice(-5) // Get the 5 most recent messages
    .map(m => m.message!.toLowerCase());

  if (userMessages.length === 0) {
    return currentStatus;
  }

  const fullText = userMessages.join(' ');
  let detectedStatus: CustomerStatus = 'New';

  if (/\b(how much|hm|available|details|info|magkano|more info)\b/i.test(fullText)) {
    detectedStatus = 'Inquiry';
  }
  if (/\b(order|buy|purchase|get|how to order|checkout|place order)\b/i.test(fullText)) {
    detectedStatus = 'Ordering';
  }
  if (/\b(paid|payment|sent|receipt|proof of payment|nagbayad na|resibo)\b/i.test(fullText)) {
    detectedStatus = 'Paid';
  }
  if (/\b(shipped|delivered|received|got it|nakuha ko na)\b/i.test(fullText)) {
    if (currentStatus === 'Paid') {
      detectedStatus = 'Shipped';
    }
  }
  if (/\b(thanks|salamat|thank you|completed|done)\b/i.test(fullText) && currentStatus === 'Shipped') {
    detectedStatus = 'Completed';
  }

  // Prevent status downgrading
  const currentIndex = STATUS_HIERARCHY.indexOf(currentStatus);
  const detectedIndex = STATUS_HIERARCHY.indexOf(detectedStatus);

  if (detectedIndex > currentIndex) {
    return detectedStatus;
  }

  return currentStatus;
};
