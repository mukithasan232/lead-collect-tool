import { PrismaClient, EmailVerificationStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting LeadPulse database seeding...');

  // 1. Create a demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@leadpulse.ai' },
    update: {},
    create: {
      email: 'demo@leadpulse.ai',
      credits: 100,
    },
  });
  console.log(`✓ Created User: ${user.email} — ${user.credits} credits`);

  // 2. Create sample leads attached to that user
  const sampleLeads = [
    {
      name: 'Sarah Jenkins',
      jobTitle: 'Founder & CEO',
      company: 'Synthetix AI',
      email: 'sarah@synthetix.ai',
      verificationStatus: EmailVerificationStatus.VERIFIED,
      sourcePlatform: 'linkedin',
      linkedinUrl: 'https://linkedin.com/in/sarah-jenkins-synthetix',
      domain: 'synthetix.ai',
    },
    {
      name: 'Marcus Vance',
      jobTitle: 'VP of Growth',
      company: 'CloudScale Data',
      email: 'm.vance@cloudscale.io',
      verificationStatus: EmailVerificationStatus.CATCH_ALL,
      sourcePlatform: 'apollo',
      linkedinUrl: 'https://linkedin.com/in/marcus-vance-cloudscale',
      domain: 'cloudscale.io',
    },
    {
      name: 'Elena Rostova',
      jobTitle: 'Head of Engineering',
      company: 'ShieldSec Cyber',
      email: 'elena@shieldsec.com',
      verificationStatus: EmailVerificationStatus.VERIFIED,
      sourcePlatform: 'manual',
      linkedinUrl: 'https://linkedin.com/in/elena-rostova-shieldsec',
      domain: 'shieldsec.com',
    },
  ];

  for (const lead of sampleLeads) {
    const created = await prisma.lead.create({
      data: {
        userId: user.id,
        ...lead,
      },
    });
    console.log(`✓ Created Lead: ${created.name} — ${created.company}`);
  }

  console.log('✅ Database seeding complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
