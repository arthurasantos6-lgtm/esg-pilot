import type { Metadata } from "next";
import { connection } from "next/server";
import { testAiIntegration } from "@/app/admin/actions";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { SubmitButton } from "@/app/components/submit-button";
import { describeAiConfig, OPENAI_COMPATIBLE_PRESETS } from "@/lib/ai/config";
import { getAiConfig } from "@/lib/ai/service";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "IA e integrações" };

export default async function AdminAiPage({
  searchParams,
}: {
  searchParams: Promise<{ tested?: string; model?: string; latency?: string; error?: string }>;
}) {
  await connection();
  const { user } = await requirePlatformAdmin();
  const query = await searchParams;
  const config = describeAiConfig(getAiConfig());
  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const aiActive = Boolean(config && serviceRoleConfigured);

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <p className="eyebrow">TECNOLOGIA</p>
          <h1>IA e integrações</h1>
          <p className="muted">
            Provedor e modelo usados pelo copiloto e pela avaliação ESG. A configuração é feita por variáveis de ambiente no
            servidor; esta tela nunca exibe chaves.
          </p>
        </div>
      </header>

      {query.error && <p className="alert alert-error" role="alert">Teste falhou: {query.error}</p>}
      {query.tested && (
        <p className="alert alert-success" role="status">
          Conexão funcionando · modelo {query.model} · {query.latency} ms
        </p>
      )}

      <div className="dashboard-grid">
        <section className="panel detail-panel" aria-labelledby="ai-status-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SITUAÇÃO ATUAL</p>
              <h2 id="ai-status-title">Integração de IA</h2>
            </div>
            <span className={`status-badge status-badge-${aiActive ? "active" : "inactive"}`}>{aiActive ? "Ativa" : "Inativa"}</span>
          </div>
          <dl className="follow-up-summary">
            <div><dt>Provedor</dt><dd>{config?.provider ?? "Nenhum configurado"}</dd></div>
            <div><dt>Modelo</dt><dd>{config?.model ?? "—"}</dd></div>
            <div><dt>Endereço da API</dt><dd>{config?.host ?? (config ? "padrão do provedor" : "—")}</dd></div>
            <div><dt>Chave do provedor</dt><dd>{config ? (config.hasApiKey ? "Configurada" : "Não usada") : "—"}</dd></div>
            <div><dt>Chave service role (Supabase)</dt><dd>{serviceRoleConfigured ? "Configurada" : "Ausente"}</dd></div>
          </dl>
          {!aiActive && (
            <p className="alert alert-info">
              Sem IA ativa, as empresas continuam registrando, revisando e enviando ideias; o copiloto e a avaliação por IA
              aparecem como indisponíveis. {!serviceRoleConfigured && "Defina SUPABASE_SERVICE_ROLE_KEY no servidor."}
            </p>
          )}
          {config && (
            <form action={testAiIntegration}>
              <SubmitButton className="button button-secondary" pendingLabel="Testando…">Testar conexão</SubmitButton>
              <p className="field-hint">Envia apenas uma mensagem de teste, sem dados de clientes.</p>
            </form>
          )}
        </section>

        <section className="panel detail-panel" aria-labelledby="ai-options-title">
          <p className="eyebrow">OPÇÕES SUPORTADAS</p>
          <h2 id="ai-options-title">Provedores disponíveis</h2>
          <ul className="evaluation-list">
            <li><strong>Anthropic (Claude)</strong> — pago. <code>ANTHROPIC_API_KEY</code>, opcional <code>ANTHROPIC_MODEL</code>.</li>
            {Object.entries(OPENAI_COMPATIBLE_PRESETS).map(([key, preset]) => (
              <li key={key}>
                <strong>{preset.label}</strong> — <code>AI_PROVIDER={key}</code>, <code>AI_MODEL</code>
                {preset.requiresKey ? ", AI_API_KEY" : ""}.
              </li>
            ))}
            <li><strong>Outra API compatível com OpenAI</strong> — <code>AI_PROVIDER=openai-compatible</code>, <code>AI_BASE_URL</code>, <code>AI_MODEL</code> e, se exigido, <code>AI_API_KEY</code>.</li>
          </ul>
          <p className="small-copy muted">
            Antes de usar dados reais, confira os termos do provedor: algumas camadas gratuitas podem usar o conteúdo enviado
            para melhorar seus produtos. O Ollama roda localmente e não envia dados para terceiros.
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
