import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create a test user
  const testUser = await prisma.user.upsert({
    where: { whatsappNumber: '+919999999999' },
    update: {},
    create: {
      whatsappNumber: '+919999999999',
      email: 'test@example.com',
      timezone: 'Asia/Kolkata',
      snoozeMinutesDefault: 15,
      reminderLeadTime: 0,
    },
  });

  console.log('Created test user:', testUser.id);

  // Create some sample tasks
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        userId: testUser.id,
        title: 'Review quarterly report',
        status: 'TODO',
        source: 'WEB',
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        reminderAt: new Date(Date.now() + 20 * 60 * 60 * 1000), // 20 hours from now
      },
    }),
    prisma.task.create({
      data: {
        userId: testUser.id,
        title: 'Build a habit tracker app',
        notes: 'Could use React Native or Flutter',
        status: 'IDEA',
        source: 'WHATSAPP',
      },
    }),
    prisma.task.create({
      data: {
        userId: testUser.id,
        title: 'Send project proposal',
        status: 'DONE',
        source: 'WHATSAPP',
      },
    }),
    prisma.task.create({
      data: {
        userId: testUser.id,
        title: 'Call dentist for appointment',
        status: 'TODO',
        source: 'WHATSAPP',
        reminderAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      },
    }),
    prisma.task.create({
      data: {
        userId: testUser.id,
        title: 'Explore AI automation tools',
        notes: 'Look into n8n, Make, Zapier alternatives',
        status: 'IDEA',
        source: 'WEB',
      },
    }),
  ]);

  console.log('Created', tasks.length, 'sample tasks');

  // Create a scheduled reminder for one of the tasks
  const taskWithReminder = tasks.find((t) => t.reminderAt && t.status === 'TODO');
  if (taskWithReminder && taskWithReminder.reminderAt) {
    await prisma.reminder.create({
      data: {
        taskId: taskWithReminder.id,
        userId: testUser.id,
        scheduledAt: taskWithReminder.reminderAt,
        state: 'SCHEDULED',
        deliveryMode: 'SESSION_FREEFORM',
      },
    });
    console.log('Created reminder for task:', taskWithReminder.title);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
