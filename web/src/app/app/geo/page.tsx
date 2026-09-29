import { GeoList } from './geo-list';

type GeoPageProps = {
  searchParams: Promise<{ parentId?: string }>;
};

export default async function GeoPage({ searchParams }: GeoPageProps) {
  const { parentId } = await searchParams;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        El shell puede pasar canCreate más adelante.
      </p>
      {parentId ? (
        <GeoList parentId={parentId} canCreate={false} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Indica parentId en la URL para listar los hijos de una unidad.
        </p>
      )}
    </div>
  );
}
