import React from 'react';

interface PostImageProps {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
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
  </div>
);
