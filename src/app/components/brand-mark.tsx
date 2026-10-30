import Image from "next/image";

/** Logo da marca; o tamanho exibido é definido em `.brand-mark` no CSS. */
export function BrandMark() {
  return <Image className="brand-mark" src="/logo-nuevo.png" alt="NUEVO" width={512} height={512} sizes="96px" />;
}
