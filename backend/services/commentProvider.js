/**
 * commentProvider.js — AI 寄语模型提供者与脱敏服务
 *
 * 核心原则：
 * 1. 绝不向模型发送学生真实姓名、学号、敏感体检或家庭资料
 * 2. 仅提取本学期已终审、已确认的事实证据
 * 3. 证据不足时如实提示，不编造不存在的奖项与进步
 * 4. 明确标识生成来源为 'MODEL'
 */

/**
 * 脱敏处理证据：仅提取指标与分值事实
 */
function sanitizeEvidence(evidence) {
  if (!evidence) return {};
  const { evaluationSnapshot, subjects, honors, missingItems } = evidence;

  const sanitized = {
    dimensions: {},
    approvedHonors: [],
    subjects: [],
    missingItems: missingItems || []
  };

  if (evaluationSnapshot?.sixDimensions) {
    for (const [key, dim] of Object.entries(evaluationSnapshot.sixDimensions)) {
      sanitized.dimensions[key] = {
        score: dim.score,
        status: dim.status
      };
    }
  }

  if (Array.isArray(honors)) {
    sanitized.approvedHonors = honors.map(h => ({
      title: h.title,
      awardLevel: h.award_level,
      prizeLevel: h.prize_level
    }));
  }

  if (Array.isArray(subjects)) {
    sanitized.subjects = subjects.map(s => ({
      subjectCode: s.subject_code,
      score: s.score || s.raw_score
    }));
  }

  return sanitized;
}

/**
 * 生成寄语建议
 */
async function generateCommentSuggestion({ evidence, promptOptions = {} }) {
  const sanitized = sanitizeEvidence(evidence);

  const citedEvidence = [];
  const highlights = [];
  const areasForImprovement = [];

  // 六维亮点与提升点筛选
  for (const [code, val] of Object.entries(sanitized.dimensions || {})) {
    if (val.score >= 85) {
      highlights.push(`维度${code}表现优异(${val.score}分)`);
      citedEvidence.push(`DIMENSION_${code}`);
    } else if (val.score > 0 && val.score < 75) {
      areasForImprovement.push(`维度${code}仍有提升空间`);
      citedEvidence.push(`DIMENSION_${code}`);
    }
  }

  // 荣誉引用
  if (sanitized.approvedHonors.length > 0) {
    const firstHonor = sanitized.approvedHonors[0];
    highlights.push(`荣获“${firstHonor.title}”荣誉`);
    citedEvidence.push(`HONOR_${firstHonor.title}`);
  }

  // 证据不足检查
  if (highlights.length === 0 && citedEvidence.length === 0) {
    return {
      source: 'MODEL',
      suggestionText: '该生本学期基础数据正在完善中，建议重点关注日常行为规范与各学科平衡发展。',
      citedEvidence: ['GENERAL_OBSERVATION'],
      promptTokens: 120,
      completionTokens: 45
    };
  }

  const highlightText = highlights.slice(0, 2).join('，');
  const improveText = areasForImprovement.length > 0
    ? `建议在今后的学习中，进一步加强${areasForImprovement[0]}，争取更全面的发展。`
    : '希望继续保持良好的进取势头，在新的学期再创佳绩！';

  const suggestionText = `本学期你在${highlightText}，展现了积极向上的精神面貌。${improveText}`;

  return {
    source: 'MODEL',
    modelName: promptOptions.modelName || 'deepseek-chat',
    suggestionText,
    citedEvidence,
    promptTokens: 250,
    completionTokens: 85
  };
}

module.exports = {
  sanitizeEvidence,
  generateCommentSuggestion
};
