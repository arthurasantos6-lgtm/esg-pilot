/** Primeira fala do copiloto: fixa, não gravada na conversa nem enviada à IA. */
export function ChatGreeting({ aiAvailable, name }: { aiAvailable: boolean; name?: string | null }) {
  return (
    <li className="chat-message chat-message-assistant">
      <span className="chat-author">{aiAvailable ? "Copiloto (IA)" : "Assistente"}</span>
      <p>
        Olá{name ? <>, <span className="chat-greeting-name">{name}</span></> : ""}! Me conte sua ideia do seu jeito: o que acontece hoje e o que você imagina que poderia melhorar. Não precisa
        estar completa{aiAvailable ? ", eu ajudo a organizar" : ""}.
      </p>
      <p className="small-copy muted">Evite nomes de colegas, dados pessoais ou informações confidenciais.</p>
    </li>
  );
}
