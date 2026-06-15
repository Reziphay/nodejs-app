import prisma from './prisma';

/**
 * When a brand leaves ACTIVE (rejected, or reset to PENDING on edit), its
 * services must stop being publicly bookable: pause any ACTIVE services and
 * cancel their upcoming PENDING/CONFIRMED reservations, notifying each customer.
 * Paused services can be resumed by the owner once the brand is approved again.
 */
export async function suspendBrandServices(brandId: string): Promise<void> {
  const services = await prisma.service.findMany({
    where: { brand_id: brandId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (services.length === 0) return;
  const serviceIds = services.map((s) => s.id);

  const reservations = await prisma.reservation.findMany({
    where: {
      service_id: { in: serviceIds },
      status: { in: ['PENDING', 'CONFIRMED'] },
      starts_at: { gte: new Date() },
    },
    select: { id: true, ucr_id: true, service_id: true, starts_at: true },
  });

  await prisma.$transaction([
    prisma.service.updateMany({
      where: { id: { in: serviceIds } },
      data: { status: 'PAUSED' },
    }),
    ...(reservations.length > 0
      ? [
          prisma.reservation.updateMany({
            where: { id: { in: reservations.map((r) => r.id) } },
            data: { status: 'CANCELLED_BY_USO' },
          }),
          prisma.notification.createMany({
            data: reservations.map((r) => ({
              user_id: r.ucr_id,
              type: 'reservation_cancelled_by_uso',
              title: 'reservation_cancelled_by_uso',
              body: '',
              data: {
                reservation_id: r.id,
                service_id: r.service_id,
                starts_at: r.starts_at.toISOString(),
                reason: 'brand_suspended',
              },
            })),
          }),
        ]
      : []),
  ]);
}
