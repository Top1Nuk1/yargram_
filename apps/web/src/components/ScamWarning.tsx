/**
 * Предупреждение о мошенничестве — текст владельца Yargram, а не описание
 * человека. Помеченный SCAM не должен иметь возможности выдать его за своё
 * «о себе», поэтому текст нельзя ни выделить, ни скопировать, ни утащить
 * мышью, ни забрать через контекстное меню.
 *
 * Запрет висит на самом предупреждении, а не на карточке профиля: иначе вместе
 * с ним перестали бы выделяться имя, юзернейм и дата регистрации.
 */

/** Гасит действие по умолчанию у событий копирования, вырезания и перетаскивания. */
export function blockCopy(event: { preventDefault: () => void }) {
  event.preventDefault();
}

/** Готовый набор обработчиков для любого элемента с текстом предупреждения. */
export const scamGuard = {
  onCopy: blockCopy,
  onCut: blockCopy,
  onContextMenu: blockCopy,
  onDragStart: blockCopy,
};

export function ScamWarning({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p className={`select-none ${className}`.trim()} {...scamGuard}>
      {text}
    </p>
  );
}
