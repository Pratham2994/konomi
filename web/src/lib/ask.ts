/** "How was X?" without doubled marks: "Your Name." asks "Your Name?", "K-On!" keeps its own "!". */
export function asked(name: string): [string, string] {
  if (name.endsWith('.')) return [name.slice(0, -1), '?']
  return /[!?]$/.test(name) ? [name, ''] : [name, '?']
}
