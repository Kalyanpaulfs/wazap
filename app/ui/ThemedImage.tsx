import Image, { type ImageProps } from "next/image";

/** `/art/home/x.webp` -> `/art/home/dark/x.webp` (generated dark-theme counterpart). */
export function darkArtSrc(src: string) {
  const i = src.lastIndexOf("/");
  return `${src.slice(0, i)}/dark/${src.slice(i + 1)}`;
}

/**
 * Renders the light artwork in the light theme and its own generated dark artwork in the dark theme.
 * Light art sits on the page background (multiply blend); dark art sits on near-black (screen blend). Never reuse one for the other.
 */
export default function ThemedImage({ src, className = "", priority, fetchPriority, ...rest }: Omit<ImageProps, "src"> & { src: string }) {
  return (
    <>
      <Image src={src} className={`${className} mix-blend-multiply dark:hidden`} priority={priority} fetchPriority={fetchPriority} {...rest} />
      <Image src={darkArtSrc(src)} className={`${className} hidden mix-blend-screen dark:block`} priority={priority} fetchPriority={fetchPriority} {...rest} />
    </>
  );
}
