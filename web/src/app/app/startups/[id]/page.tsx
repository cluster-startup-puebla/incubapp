import { StartupDetail } from './startup-detail';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StartupDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <StartupDetail startupId={id} />;
}
