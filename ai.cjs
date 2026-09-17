// Shared AI helper — DeepSeek (or any OpenAI-compatible endpoint)
// Uses process.env for configuration (set via Worker deployment, not .env file)
const fs = require('fs');
const path = require('path');

// DeepSeek configuration — read from process.env set at deployment
const deepSeekKey = () => process.env.DEEPSEEK_API_KEY || '';
const deepSeekModel = () => process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const deepSeekBase = () => process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const deepSeekChat = async (system, messages, options) => {
  const key = deepSeekKey();
  if (!key) throw new Error('NO_KEY');
  // In a real deployment, would make API call to DeepSeek
  // For now, return a placeholder response
  return 'فهمت طلبك، جاري المعالجة...';
};

const discoveryAgent = async (messages, options) => {
  // Placeholder for discovery agent
  return { structured: '', reply: '' };
};

const formatDiscoveryReply = (structured) => structured.reply || structured.text || '';

module.exports = {
  deepSeekKey,
  deepSeekModel,
  deepSeekBase,
  deepSeekChat,
  discoveryAgent,
  formatDiscoveryReply
};