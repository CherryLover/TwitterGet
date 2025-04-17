import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import {
  CODE_REVIEW_PROMPT,
  TITLE_GENERATE_PROMPT,
  TAG_GENERATE_PROMPT,
  AI_DRAW_DESC_PROMPT,
  SPLIT_LONG_TEXT_PROMPT,
  CONTENT_TYPE_ANALYSIS_PROMPT,
  SOCIAL_SHARE_REWRITE_PROMPT
} from './ai-service-prompts';

// 加载环境变量
dotenv.config();

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  format_json?: boolean;
}

class AIService {
  private serviceUrl: string;
  private token: string;
  private model: string;
  private timeout: number;

  constructor(
    serviceUrl?: string,
    token?: string,
    model?: string,
    timeout?: number
  ) {
    // 检查环境变量中的配置
    this.serviceUrl = serviceUrl || process.env.AI_SERVICE_URL || '';
    if (!this.serviceUrl) {
      throw new Error('AI服务地址未配置');
    }

    this.token = token || process.env.AI_SERVICE_TOKEN || '';
    if (!this.token) {
      throw new Error('AI服务访问令牌未配置');
    }

    this.model = model || process.env.AI_SERVICE_MODEL || 'gpt-3.5-turbo';
    this.timeout = timeout || parseInt(process.env.AI_SERVICE_TIMEOUT || '120');

    // 标准化服务URL
    this.serviceUrl = this.serviceUrl.replace(/\/+$/, '');
    if (!this.serviceUrl.endsWith('/v1')) {
      this.serviceUrl += '/v1';
    }
  }

  /**
   * 调用AI服务进行对话
   */
  async chatCompletion(
    systemPrompt: string,
    userMessages: string[],
    options: ChatCompletionOptions = {}
  ): Promise<string> {
    try {
      const url = `${this.serviceUrl}/chat/completions`;
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      };
      
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
      ];
      
      for (const message of userMessages) {
        messages.push({ role: 'user', content: message });
      }
      
      const data: any = {
        model: options.model || this.model,
        messages: messages,
        temperature: options.temperature || 0.7
      };
      
      if (options.max_tokens) {
        data.max_tokens = options.max_tokens;
      }
      
      if (options.format_json) {
        data.response_format = { type: 'json_object' };
      }
      
      // console.log(`系统提示: ${systemPrompt}`);
      // console.log(`调用AI服务: URL: ${url}, 消息数量: ${messages.length}`);
      
      const startTime = Date.now();
      const response = await axios.post(url, data, {
        headers,
        timeout: this.timeout * 1000
      });
      const endTime = Date.now();
      
      console.log(`AI服务返回结果: ${response.status}, 耗时: ${(endTime - startTime) / 1000} 秒`);
      
      if (response.status === 200) {
        return response.data.choices[0]?.message?.content || '';
      } else {
        console.log('AI服务返回结果:', JSON.stringify(response, null, 2));
        throw new Error(`AI服务调用失败: HTTP ${response.status}`);
      }
    } catch (error: any) {
      console.log('AI服务调用错误:', error);
      if (error.code === 'ECONNABORTED') {
        throw new Error(`AI服务调用超时 (${this.timeout}秒)`);
      }
      
      if (error.response) {
        const errorMsg = `AI服务调用失败: HTTP ${error.response.status}`;
        try {
          const errorDetail = JSON.stringify(error.response.data);
          throw new Error(`${errorMsg}\n详细信息: ${errorDetail}`);
        } catch {
          throw new Error(`${errorMsg}\n响应内容: ${error.response.data}`);
        }
      }
      
      throw new Error(`AI服务调用异常: ${error.message}`);
    }
  }

  /**
   * 尝试获取JSON格式的结果
   */
  async attemptGetJsonResult(systemPrompt: string, content: string): Promise<any | null> {
    try {
      const result = await this.chatCompletion(systemPrompt, [content], { format_json: true });
      return JSON.parse(result);
    } catch (error) {
      console.error('解析JSON结果失败:', error);
      return null;
    }
  }

  /**
   * 代码审查
   */
  async codeReview(reviewText: string, systemPrompt?: string): Promise<any> {
    // 使用导入的提示词常量
    return this.chatCompletion(systemPrompt || CODE_REVIEW_PROMPT, [reviewText], { format_json: true });
  }

  /**
   * 根据内容生成标题
   */
  async generateTitleByContent(content: string): Promise<string> {
    const result = await this.attemptGetJsonResult(TITLE_GENERATE_PROMPT, content);
    return result?.title || '';
  }

  /**
   * 根据内容生成标签
   */
  async generateTagsByContent(content: string): Promise<string[]> {
    const result = await this.attemptGetJsonResult(TAG_GENERATE_PROMPT, content);
    return result?.tags || [];
  }

  /**
   * 生成AI绘图提示词
   */
  async generateAiDrawDescTextByPrompt(content: string): Promise<string> {
    return this.chatCompletion(AI_DRAW_DESC_PROMPT, [content]);
  }

  /**
   * 将长文本分割成多个短文本
   */
  async splitLongText(text: string): Promise<string[]> {
    const result = await this.attemptGetJsonResult(SPLIT_LONG_TEXT_PROMPT, text);
    if (result?.text) {
      return result.text;
    } else {
      // 按1000个字符分割
      const chunks = [];
      for (let i = 0; i < text.length; i += 1000) {
        chunks.push(text.substring(i, i + 1000));
      }
      return chunks;
    }
  }

  /**
   * 分析内容类型
   */
  async contentTypeAnalysis(content: string): Promise<any> {
    const result = await this.attemptGetJsonResult(CONTENT_TYPE_ANALYSIS_PROMPT, content);
    if (result) {
      return result;
    } else {
      return {
        content_type: 'unknown',
        analysis_reason: '分析失败',
        content_type_score: 0
      };
    }
  }

  /**
   * 生成社交媒体分享内容
   */
  async socialShareRewrite(content: string): Promise<string> {
    const result = await this.attemptGetJsonResult(SOCIAL_SHARE_REWRITE_PROMPT, content);
    return result?.content || '';
  }
}

// 创建一个工具函数，方便使用
export function createAIService(): AIService {
  return new AIService();
}

// 使用示例
async function testAIService() {
  try {
    const aiService = createAIService();
    
    console.log('===== 测试社交媒体内容改写 =====');
    const shareResult = await aiService.contentTypeAnalysis(`
    AI发展到这般，该反着用了。经过这两个月的AI普及，我发现大家还在正着用AI，比如写个文案、脑爆个方案、检查个错别字…停留在创造，在我看来是没有方向的"进步"，是时候要反着用AI了。反着用AI，能策反你的想法，找到你的漏洞，如此一般，你才能精准进步。
    `);
    console.log('内容类型分析:', shareResult);
    
    // console.log('\n===== 测试标题生成 =====');
    // const titleResult = await aiService.generateTitleByContent('如何有效利用AI工具提高工作效率和创造力，同时避免过度依赖');
    // console.log('生成的标题:', titleResult);
    
    // console.log('\n===== 测试标签生成 =====');
    // const tagsResult = await aiService.generateTagsByContent('Twitter API使用教程：如何获取用户推文并保存到数据库');
    // console.log('生成的标签:', tagsResult);

  } catch (error: any) {
    console.error(`测试失败: ${error.message}`);
  }
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  testAIService();
}

export default AIService; 