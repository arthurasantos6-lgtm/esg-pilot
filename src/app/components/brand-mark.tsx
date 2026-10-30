import Image from "next/image";

/** Logo da marca; o tamanho exibido é definido em `.brand-mark` no CSS. */
export function BrandMark() {
  return <Image className="brand-mark" src="/logo-nuevo.png" alt="NUEVO" width={512} height={512} sizes="96px" />;
}

/** Nome da marca, com NUEVO no desenho da logo: o "E" é formado por três barras. */
export function BrandWordmark() {
  return (
    <span className="brand-wordmark">
      <span className="sr-only">NUEVO ESG</span>
      <span className="brand-logotype" aria-hidden="true">
        NU
        <span className="brand-logotype-e">
          <span />
          <span />
          <span />
        </span>
        VO
      </span>
      <span className="brand-accent" aria-hidden="true">ESG</span>
    </span>
  );
}
