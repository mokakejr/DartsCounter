import './ExitConfirmModal.css';

export default function ExitConfirmModal({ open, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="ecm__overlay" onClick={onCancel}>
      <div className="ecm__dialog" onClick={e => e.stopPropagation()}>
        <p className="ecm__title">Quitter la partie ?</p>
        <p className="ecm__body">La partie en cours sera perdue.</p>
        <div className="ecm__actions">
          <button className="ecm__btn ecm__btn--cancel" onClick={onCancel}>Continuer</button>
          <button className="ecm__btn ecm__btn--confirm" onClick={onConfirm}>Quitter</button>
        </div>
      </div>
    </div>
  );
}
