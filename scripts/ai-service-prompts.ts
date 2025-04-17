/**
 * AI服务提示词模板
 * 
 * 包含各种AI服务调用的提示词模板
 */

// 代码审查提示词
export const CODE_REVIEW_PROMPT = `你是一位经验丰富的代码审查专家。请对提供的代码进行全面审查，并以JSON格式返回结果。
分析以下几个方面:
1. 安全问题和漏洞
2. 性能优化机会
3. 代码质量和最佳实践
4. 可读性和可维护性

返回格式:
{
  "summary": "总体评价",
  "security_issues": [{"issue": "问题描述", "severity": "高/中/低", "recommendation": "修复建议"}],
  "performance_issues": [{"issue": "问题描述", "impact": "影响程度", "recommendation": "优化建议"}],
  "code_quality": [{"issue": "问题描述", "recommendation": "改进建议"}],
  "maintainability": [{"issue": "问题描述", "recommendation": "改进建议"}]
}`;

// 生成标题提示词
export const TITLE_GENERATE_PROMPT = `请根据提供的内容生成一个简洁、吸引人的标题。以JSON格式返回:
{
  "title": "生成的标题"
}`;

// 生成标签提示词
export const TAG_GENERATE_PROMPT = `请分析提供的内容，生成5-10个相关标签。以JSON格式返回:
{
  "tags": ["标签1", "标签2", "标签3"]
}`;

// 生成AI绘图描述提示词
export const AI_DRAW_DESC_PROMPT = `你是专业的AI绘图提示词生成专家。请根据用户的描述，生成详细的绘图提示词，包含图像风格、主体、背景、光照等细节。`;

// 分割长文本提示词
export const SPLIT_LONG_TEXT_PROMPT = `请将提供的长文本分割成多个独立的段落或章节，每部分保持完整的语义。以JSON格式返回:
{
  "text": ["第一部分", "第二部分", "第三部分"]
}`;

// 内容类型分析提示词
export const CONTENT_TYPE_ANALYSIS_PROMPT = `你是一个经验丰富的内容编辑，分析内容类型，并给出分析结果。

1. 参考内容，判断内容类型，并给出分析结果。
2. 内容类型包括:
    - 社交媒体帖子：post
    - AI 绘图提示词：ai_draw
    - 文章：article
3. 分析内容类型时，要考虑内容的关键词、内容的重点、内容的核心等因素。


**输出格式：**

你必须以 JSON 格式返回结果，格式如下：
{
    "content_type": "post"
    "analysis_reason": "分析原因，判断内容类型为 post 的原因"
    "content_type_score": 0.8
}`;

// 社交媒体分享内容改写提示词
export const SOCIAL_SHARE_REWRITE_PROMPT = `请将提供的内容改写为适合社交媒体分享的简短文本。以JSON格式返回:
{
  "content": "改写后的内容"
}`; 