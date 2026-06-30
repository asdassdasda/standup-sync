export function parseChatLog(text) {
  if (!text || !text.trim()) return []
  const lines = text.split('\n').filter(l => l.trim())
  const results = []

  for (const line of lines) {
    // "名字：内容" or "Name: content"
    const colonMatch = line.match(/^(.+?)[：:]\s*(.+)/)
    if (colonMatch) {
      results.push({ name: colonMatch[1].trim(), content: colonMatch[2].trim() })
      continue
    }
    // "名字 内容" (2-4 chars name)
    const spaceMatch = line.match(/^([一-龥a-zA-Z]{2,4})\s+(.+)/)
    if (spaceMatch) {
      results.push({ name: spaceMatch[1].trim(), content: spaceMatch[2].trim() })
      continue
    }
    // Treat whole line as content with unknown sender
    results.push({ name: '', content: line.trim() })
  }

  return results
}
