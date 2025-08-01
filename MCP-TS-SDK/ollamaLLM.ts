
import fetch from 'node-fetch';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string |unknown;
};

export type OllamaLLMTool = {
    type: "function",
    function: {
      name: string,
      description: string,
      parameters: Record<string, any>;
    }  
};

export type OllamaLLMResponse = {
  model: string;
  created_at: string;
  response:  string;
  done: boolean;
  context: any[]
};

export type OllamaLLMResponseJSON = {
  model: string;
  created_at: string;
  response:  object;
  done: boolean;
  context: any[]
};


export type OllamaLLMResponseToolsMessage = {  
    role: string,
    content: string,
    tool_calls: [
      {
        function: {
          name: string,
          arguments: any
        },
      }
    ]
};

export type OllamaLLMResponseJSONTools = {
  model: string;
  created_at: string;
  response:  object;
  done: boolean;
  context: any[]
};

export async function callOllamaLLM(
  model: string,
  promptContent: string,
  callContext ?: any[]
): Promise<OllamaLLMResponse> {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,      
      prompt: promptContent,    
      stream: false,
      context: callContext
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama call failed: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as OllamaLLMResponse;  
  return result;
}

export async function callOllamaLLJson(
  model: string,
  promptContent: string,
  callContext ?: any[],
  
): Promise<OllamaLLMResponseJSON> {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,      
      prompt: promptContent,
      format: "json",
      stream: false,
      context: callContext
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama call failed: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as OllamaLLMResponseJSON;  
  return result;
}

export async function callOllamaLLMJsonWithTools(
  model: string,
  messages: ChatMessage[],
  tools: OllamaLLMTool[],
  callContext ?: any[],
  
): Promise<OllamaLLMResponseToolsMessage> {
  console.log("callOllamaLLMJsonWithTools - Messages: *****\n", JSON.stringify(messages,null,2),"\n*****");
  //console.log("callOllamaLLJsonTools - Tools: *****\n", JSON.stringify(tools,null,2),"\n*****");
  
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,      
      messages: messages,
      tools: tools,      
      stream: false,      
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama call failed: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as OllamaLLMResponseToolsMessage;  
  return result;
}
