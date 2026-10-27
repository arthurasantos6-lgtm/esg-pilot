type DimensionDefaults = {
  keywords: string[];
  explanation: string;
  suggestedMetrics: string[];
};

export type CriteriaFormDefaults = {
  label?: string;
  notes?: string | null;
  thresholdAlto?: number;
  thresholdMedio?: number;
  E?: DimensionDefaults;
  S?: DimensionDefaults;
  G?: DimensionDefaults;
};

const dimensionMeta = [
  { key: "E", title: "Ambiental (E)" },
  { key: "S", title: "Social (S)" },
  { key: "G", title: "Governança (G)" },
] as const;

export function CriteriaFormFields({ defaults }: { defaults: CriteriaFormDefaults }) {
  return (
    <>
      <label htmlFor="label">Nome da versão <span aria-hidden="true">*</span></label>
      <input id="label" name="label" type="text" minLength={2} maxLength={160} required defaultValue={defaults.label ?? ""} placeholder="Ex.: v2 - inclui termos de cadeia de suprimentos" />

      <label htmlFor="notes">Notas internas</label>
      <textarea id="notes" name="notes" rows={2} maxLength={2000} defaultValue={defaults.notes ?? ""} placeholder="Contexto da mudança, motivo da revisão, referências." />

      <fieldset className="module-fieldset">
        <legend>Limites de potencial (quantidade de termos encontrados)</legend>
        <div className="date-fields">
          <div>
            <label htmlFor="thresholdMedio">Potencial médio a partir de</label>
            <input id="thresholdMedio" name="thresholdMedio" type="number" min={1} required defaultValue={defaults.thresholdMedio ?? 2} />
          </div>
          <div>
            <label htmlFor="thresholdAlto">Potencial alto a partir de</label>
            <input id="thresholdAlto" name="thresholdAlto" type="number" min={1} required defaultValue={defaults.thresholdAlto ?? 4} />
          </div>
        </div>
      </fieldset>

      {dimensionMeta.map(({ key, title }) => (
        <fieldset className="module-fieldset" key={key}>
          <legend>{title}</legend>
          <label htmlFor={`${key}_keywords`}>Termos-chave (um por linha ou separados por vírgula) <span aria-hidden="true">*</span></label>
          <textarea
            id={`${key}_keywords`}
            name={`${key}_keywords`}
            rows={3}
            required
            defaultValue={(defaults[key]?.keywords ?? []).join("\n")}
            placeholder="energia&#10;água&#10;resíduo"
          />
          <label htmlFor={`${key}_explanation`}>Explicação exibida ao gestor <span aria-hidden="true">*</span></label>
          <textarea
            id={`${key}_explanation`}
            name={`${key}_explanation`}
            rows={2}
            required
            defaultValue={defaults[key]?.explanation ?? ""}
          />
          <label htmlFor={`${key}_metrics`}>Indicadores sugeridos (um por linha)</label>
          <textarea
            id={`${key}_metrics`}
            name={`${key}_metrics`}
            rows={3}
            defaultValue={(defaults[key]?.suggestedMetrics ?? []).join("\n")}
          />
        </fieldset>
      ))}
    </>
  );
}
