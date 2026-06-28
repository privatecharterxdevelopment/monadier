import { Navigate } from 'react-router-dom';
import { getAppQueryLink } from '../../lib/appUrls';

/** Legacy dashboard route — HL bot lives in Pro Trade app. */
export default function BotTradingHubPage() {
  return <Navigate to={getAppQueryLink('section=bot')} replace />;
}
