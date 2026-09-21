import { useRef, type ChangeEvent, type ReactNode } from 'react';

interface PhotoButtonProps {
  onPick: (file: File) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

/**
 * Ouvre le sélecteur natif de l'appareil. L'attribut `capture` est volontairement
 * absent : sur téléphone, le sélecteur propose alors l'appareil photo *et* la
 * galerie, là où `capture` imposerait la prise de vue et interdirait de reprendre
 * une photo déjà faite.
 */
export default function PhotoButton({ onPick, children, className, disabled }: PhotoButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onPick(file);
  }

  return (
    <>
      <button
        type="button"
        className={className ?? 'btn btn--ghost'}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleChange}
        aria-label="Photo"
      />
    </>
  );
}
