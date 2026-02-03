import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import {
  CLASSIFICATION_PROMPT,
  QUESTION_GENERATION_PROMPT,
  SPEC_GENERATION_PROMPT,
  QUESTION_ANSWERING_PROMPT,
} from '../utils/prompts';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

export interface ClassificationResult {
  isRelevant: boolean;
  intent: 'question' | 'task';
  type: 'feature' | 'fix' | 'change' | null;
  affectedAreas: string[];
  summary: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function classifyRequest(message: string): Promise<ClassificationResult> {
  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 512,
    system: CLASSIFICATION_PROMPT,
    messages: [{ role: 'user', content: message }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Extract JSON from response (handle potential markdown wrapping)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { isRelevant: false, intent: 'question', type: null, affectedAreas: [], summary: '' };
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { isRelevant: false, intent: 'question', type: null, affectedAreas: [], summary: '' };
  }
}

export async function generateQuestions(
  taskDescription: string,
  codebaseContext: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Here is the relevant codebase context:\n\n${codebaseContext}\n\nOriginal task request: "${taskDescription}"`,
    },
  ];

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // If there's history, add a prompt to continue
  if (conversationHistory.length > 0) {
    messages.push({
      role: 'user',
      content:
        'Based on the answers provided, do you have enough information to write a spec? If not, ask your next round of follow-up questions. If yes, say "READY_FOR_SPEC" and briefly summarize what you have.',
    });
  }

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 2048,
    system: QUESTION_GENERATION_PROMPT,
    messages,
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');
}

export async function generateSpec(
  taskDescription: string,
  codebaseContext: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Codebase context:\n\n${codebaseContext}\n\nOriginal task request: "${taskDescription}"`,
    },
  ];

  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({
    role: 'user',
    content: 'Generate the final task specification based on everything discussed.',
  });

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 4096,
    system: SPEC_GENERATION_PROMPT,
    messages,
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');
}

export async function answerQuestion(
  question: string,
  codebaseContext: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Here is the relevant codebase context:\n\n${codebaseContext}\n\nQuestion: "${question}"`,
    },
  ];

  // Add conversation history if there are follow-up questions
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 3072,
    system: QUESTION_ANSWERING_PROMPT,
    messages,
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');
}
