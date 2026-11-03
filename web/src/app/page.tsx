import { HealthStatus } from '@/components/health-status';
import { PortalEntry } from './portal-entry';

export default function Home() {
  return (
    <PortalEntry>
      <h1>Hello World</h1>
      <HealthStatus />
    </PortalEntry>
  );
}
