# Origem

Skill copiada de [morluto/rea](https://github.com/morluto/rea)
(`.agents/skills/reverse-engineer-anything`), licença MIT (ver `LICENSE`).

- Commit: `de8b2f359269b7821c5bb8fa018070f6f06109b5`
- Versão do plugin upstream: 6.8.0

A skill só fornece instruções. Para as ferramentas funcionarem é preciso
registrar o MCP server do REA (`npx rea-agents setup`) ou instalar o plugin
Claude Code do REA.

Para atualizar, copie novamente a pasta do upstream e ajuste o commit acima.

## MCP server

O `.mcp.json` na raiz do repositório registra o servidor `rea` via
`npx -y rea-agents@6.8.0 mcp` (versão fixada). Para atualizar, troque a versão
lá e aqui. O Claude Code pede aprovação antes de ativar MCP servers de projeto.
