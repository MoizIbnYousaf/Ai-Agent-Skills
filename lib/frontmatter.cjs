const YAML = require('yaml');

function parseSkillMarkdown(raw) {
  const input = String(raw || '');
  const match = input.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  try {
    const frontmatter = YAML.parse(match[1]) || {};
    if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
      return null;
    }
    return {
      frontmatter,
      content: match[2].trim(),
    };
  } catch {
    return null;
  }
}

module.exports = {
  parseSkillMarkdown,
};
