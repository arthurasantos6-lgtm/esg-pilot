import { BR_STATES, ESG_PRIORITIES, type CompanyProfile } from "@/lib/company-profile";

const numberText = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));

/**
 * Perfil da empresa no cadastro. Tudo opcional; quanto mais completo, melhores as
 * perguntas feitas aos colaboradores e mais real o cálculo de retorno das ideias.
 */
export function CompanyProfileFields({ profile }: { profile: CompanyProfile | null }) {
  const p = profile;
  return (
    <fieldset className="module-fieldset profile-fieldset">
      <legend>Perfil da empresa (opcional)</legend>
      <p className="field-hint">
        Ajuda na coleta: áreas e unidades viram opções nas perguntas das ideias, e tarifas e dias de funcionamento entram no cálculo de
        retorno no lugar de suposições.
      </p>

      <div className="profile-grid">
        <label>
          Nº de funcionários
          <input name="profile-employees" inputMode="numeric" placeholder="Ex.: 250" defaultValue={numberText(p?.employees ?? null)} />
        </label>
        <label>
          Estado
          <select name="profile-state" defaultValue={p?.state ?? ""}>
            <option value="">—</option>
            {BR_STATES.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </label>
        <label>
          Cidade
          <input name="profile-city" maxLength={100} placeholder="Ex.: Serra" defaultValue={p?.city ?? ""} />
        </label>
        <label>
          Dias de funcionamento por ano
          <input name="profile-operatingDays" inputMode="numeric" placeholder="Ex.: 250 (seg. a sex.) ou 365" defaultValue={numberText(p?.operatingDays ?? null)} />
        </label>
      </div>

      <div className="profile-grid profile-grid-2">
        <label>
          Unidades ou prédios
          <textarea name="profile-units" rows={3} placeholder={"Uma por linha. Ex.:\nMatriz\nCentro de distribuição"} defaultValue={p?.units.join("\n") ?? ""} />
        </label>
        <label>
          Áreas ou setores
          <textarea name="profile-areas" rows={3} placeholder={"Uma por linha. Ex.:\nProdução\nManutenção\nAdministrativo"} defaultValue={p?.areas.join("\n") ?? ""} />
        </label>
      </div>

      <div className="profile-grid">
        <label>
          Conta de energia (R$/mês)
          <input name="profile-energyBill" inputMode="decimal" placeholder="Ex.: 18.000" defaultValue={numberText(p?.energyBill ?? null)} />
        </label>
        <label>
          Tarifa de energia (R$/kWh)
          <input name="profile-energyTariff" inputMode="decimal" placeholder="Ex.: 0,85" defaultValue={numberText(p?.energyTariff ?? null)} />
        </label>
        <label>
          Conta de água (R$/mês)
          <input name="profile-waterBill" inputMode="decimal" placeholder="Ex.: 4.500" defaultValue={numberText(p?.waterBill ?? null)} />
        </label>
        <label>
          Tarifa de água (R$/m³)
          <input name="profile-waterTariff" inputMode="decimal" placeholder="Ex.: 14,50" defaultValue={numberText(p?.waterTariff ?? null)} />
        </label>
      </div>

      <span className="field-label" id="priorities-label">Temas ESG prioritários</span>
      <div className="checkbox-group profile-priorities" role="group" aria-labelledby="priorities-label">
        {ESG_PRIORITIES.map((item) => (
          <label key={item} className="checkbox-row">
            <input type="checkbox" name="profile-priorities" value={item} defaultChecked={p?.priorities.includes(item)} /> {item}
          </label>
        ))}
      </div>

      <label>
        Metas ou compromissos ESG
        <textarea name="profile-goals" rows={2} maxLength={1000} placeholder="Ex.: reduzir 15% do consumo de energia até 2027." defaultValue={p?.goals ?? ""} />
      </label>
    </fieldset>
  );
}
