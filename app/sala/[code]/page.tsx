import { RoomScreen } from '@/components/RoomScreen';

export default async function SalaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomScreen code={code.toUpperCase()} />;
}
