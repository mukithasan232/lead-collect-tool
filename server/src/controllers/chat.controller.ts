import { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../config/db';

const SYSTEM_PROMPT = `[IDENTITY & ROLE]
You are "Nova," an elite AI Solutions Architect and Lead Generation Agent for Codernest, a premium B2B custom software agency. Your primary goal is to welcome website visitors, qualify high-ticket leads, and intelligently route them to book a consultation call.

[CORE DIRECTIVES]
- Qualify the Lead: Subtly ask 1-2 discovery questions to understand their business size, current pain points (e.g., expensive third-party SaaS bloat, manual operations), and infrastructure needs.
- Highlight Value (ROI): Position our custom Next.js, Node.js, and AI infrastructure solutions as investments that save money (eliminating $500+/mo in SaaS fees) and automate manual workflows.
- Drive to Action: Once the user shows interest or shares a valid pain point, gently guide them to book a strategy call using the provided calendar link: https://calendly.com/codernest.

[TONE & STYLE]
- Be exceptionally professional, concise, and executive-level. Think like a $150/hr tech consultant.
- Avoid robotic greetings (e.g., "Hello, how can I help you today?"). Start dynamically.
- Keep responses short (under 3-4 sentences per reply) to encourage back-and-forth conversation.
- NEVER use cheap sales language (e.g., "100% satisfaction", "buy now").

[KNOWLEDGE BOUNDARY & ESCALATION]
- You only answer questions related to custom SaaS development, AI automation, CRM dashboards, and API integrations.
- If the user asks about unrelated topics (e.g., politics, coding tutorials, casual chat), politely steer the conversation back to their business software needs.
- If the user asks for exact pricing, state: "Since we build 100% custom enterprise infrastructure, pricing depends on your specific system architecture. Let's schedule a brief technical discovery call so I can give you an accurate estimate."

[FUNCTION CALLING / TOOLS]
If the user provides their email and requests a follow-up, output a JSON block structured exactly like this so the backend system can save it to the database:

JSON
{
  "action": "save_lead",
  "user_email": "user@example.com",
  "intent": "Interested in custom CRM"
}`;

export const chatController = {
  async handleChat(req: Request, res: Response) {
    try {
      const { message, history = [] } = req.body;
      
      if (!message) {
        return res.status(400).json({ success: false, message: 'Message is required' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ success: false, message: 'GEMINI_API_KEY is not configured on the server.' });
      }

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        systemInstruction: SYSTEM_PROMPT,
      });

      const chatSession = model.startChat({
        history: history.map((msg: any) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })),
      });

      const result = await chatSession.sendMessage(message);
      let responseText = result.response.text();

      // Check if the model output a JSON block for saving a lead
      const jsonMatch = responseText.match(/{\s*"action"\s*:\s*"save_lead".*}/is);
      if (jsonMatch) {
        try {
          const leadData = JSON.parse(jsonMatch[0]);
          if (leadData.user_email) {
            // Save lead to database
            await prisma.lead.create({
              data: {
                email: leadData.user_email,
                name: 'Website Visitor', // Fallback name
                company: 'Unknown',
                jobTitle: 'Lead',
                sourcePlatform: 'Nova AI Agent',
                verificationStatus: 'UNVERIFIED',
                confidence: 1.0,
                domain: leadData.user_email.split('@')[1] || null
              }
            });
            console.log(`✅ [Nova Agent] Captured and saved lead: ${leadData.user_email}`);
            
            // Remove the raw JSON block from the text sent back to the user
            responseText = responseText.replace(jsonMatch[0], '').replace(/JSON|```json|```/gi, '').trim();
            if (!responseText) {
               responseText = "Thank you. I've noted your email and intent. A member of our team will be in touch shortly.";
            }
          }
        } catch (e) {
          console.error('Error parsing Nova lead JSON:', e);
        }
      }

      res.status(200).json({
        success: true,
        data: {
          reply: responseText
        }
      });
    } catch (error: any) {
      console.error('❌ [Nova Agent Error]', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to process chat' });
    }
  }
};
