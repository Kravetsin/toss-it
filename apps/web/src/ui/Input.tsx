import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

// Общий «пиксельный» вид поля: квадратная рамка, фокус — брендовая граница.
// Фон/отступы/ширину/шрифт задаёт вызывающий через className (значения различаются по месту).
const field = 'rounded-none border-2 border-line text-text outline-none focus:border-twitch';

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${field} ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${field} ${className}`} {...rest} />;
}
