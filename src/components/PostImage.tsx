import React from 'react';

interface PostImageProps {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  watermark?: boolean;
  loading?: React.ImgHTMLAttributes<HTMLImageElement>['loading'];
  decoding?: React.ImgHTMLAttributes<HTMLImageElement>['decoding'];
  fetchPriority?: React.ImgHTMLAttributes<HTMLImageElement>['fetchPriority'];
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>['referrerPolicy'];
  onError?: React.ReactEventHandler<HTMLImageElement>;
  draggable?: boolean;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  onContextMenu?: React.MouseEventHandler<HTMLImageElement>;
}

export const PostImage: React.FC<PostImageProps> = ({
  src,
  alt,
  className = '',
  imageClassName = '',
  watermark = true,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority,
  referrerPolicy,
  onError,
  draggable,
  onClick,
  onContextMenu,
}) => (
  <div className={`relative isolate overflow-hidden bg-neutral-950 ${className}`}>
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-90 blur-3xl brightness-[0.48] saturate-125"
      loading={loading}
      decoding={decoding}
    />
    <img
      src={src}
      alt={alt}
      className={`relative z-10 block h-full w-full object-contain ${imageClassName}`}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      referrerPolicy={referrerPolicy}
      onError={onError}
      draggable={draggable}
      onClick={onClick}
      onContextMenu={onContextMenu}
    />
    {watermark && (
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute bottom-2 right-2 z-20 h-8 w-8 rounded-xl border border-white/20 bg-black/60 p-1.5 object-contain shadow-lg shadow-black/40"
        loading="lazy"
        decoding="async"
      />
    )}
  </div>
);
