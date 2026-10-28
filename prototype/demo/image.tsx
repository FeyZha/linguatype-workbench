import type { ImgHTMLAttributes } from 'react';
export default function Image({ priority: _priority, unoptimized: _unoptimized, ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean; unoptimized?: boolean }) { return <img {...props} />; }
