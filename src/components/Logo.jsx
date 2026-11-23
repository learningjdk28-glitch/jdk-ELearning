/** The Polytechnic College of La Union seal, the logo used across the app. size is in pixels. */
export default function Logo({ size = 40, className = '', decorative = false }) {
  return (
    <img
      src="/pclu-seal.png"
      width={size}
      height={size}
      alt={decorative ? '' : 'Polytechnic College of La Union'}
      aria-hidden={decorative || undefined}
      className={`shrink-0 rounded-full bg-illo-paper object-contain ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
