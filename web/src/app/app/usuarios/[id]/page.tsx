import { UsuarioDetail } from './usuario-detail';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function UsuarioPage({ params }: PageProps) {
  const { id } = await params;
  return <UsuarioDetail userId={id} />;
}
