import { useParams, useNavigate } from 'react-router-dom';
import { buildTrophies } from '../lib/trophies.js';
import TrophyModal from '../components/TrophyModal.jsx';
import './TrophyDeepLink.css';

export default function TrophyDeepLink({ stats }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const trophies = buildTrophies(stats ?? {});
  const trophy = trophies.find(t => t.id === id) ?? null;

  function handleClose() {
    navigate('/trophees');
  }

  return (
    <div className="trophy-deeplink">
      <TrophyModal trophy={trophy} onClose={handleClose} />
      {!trophy && (
        <div className="trophy-deeplink__fallback">
          <p>Trophée introuvable.</p>
          <button onClick={handleClose}>Voir tous les trophées →</button>
        </div>
      )}
    </div>
  );
}
