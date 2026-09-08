import { PrismaClient } from '@prisma/client';
import { EmailStatus } from '../src/types';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting LeadPulse database seeding...');

  // 1. Create Default Workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Acme Enterprise Sales',
    },
  });
  console.log(`✓ Created Workspace: ${workspace.name} (${workspace.id})`);

  // 2. Create Initial Admin User
  const user = await prisma.user.create({
    data: {
      email: 'alex.chen@acme.corp',
      passwordHash: '$2b$12$e8wF3QvUvC6y5y7g9w.4yeu205cE3u1W2/8Z6Z3x3iLwK.zP5t8u6', // placeholder hash
      workspaceId: workspace.id,
    },
  });
  console.log(`✓ Created User: ${user.email}`);

  // 3. Create Lead List
  const leadList = await prisma.leadList.create({
    data: {
      name: 'High-Growth AI & SaaS Founders Q1',
      workspaceId: workspace.id,
    },
  });
  console.log(`✓ Created Lead List: ${leadList.name}`);

  // 4. Create Sample Leads & Email Records
  const sampleLeads = [
    {
      firstName: 'Sarah',
      lastName: 'Jenkins',
      company: 'Synthetix AI',
      domain: 'synthetix.ai',
      title: 'Founder & CEO',
      sourcePlatform: 'linkedin',
      linkedinUrl: 'https://linkedin.com/in/sarah-jenkins-synthetix',
      email: 'sarah@synthetix.ai',
      status: EmailStatus.VERIFIED,
      score: 98.5,
    },
    {
      firstName: 'Marcus',
      lastName: 'Vance',
      company: 'CloudScale Data',
      domain: 'cloudscale.io',
      title: 'VP of Growth',
      sourcePlatform: 'apollo',
      linkedinUrl: 'https://linkedin.com/in/marcus-vance-cloudscale',
      email: 'm.vance@cloudscale.io',
      status: EmailStatus.CATCH_ALL,
      score: 82.0,
    },
    {
      firstName: 'Elena',
      lastName: 'Rostova',
      company: 'ShieldSec Cyber',
      domain: 'shieldsec.com',
      title: 'Head of Engineering',
      sourcePlatform: 'manual',
      linkedinUrl: 'https://linkedin.com/in/elena-rostova-shieldsec',
      email: 'elena@shieldsec.com',
      status: EmailStatus.VERIFIED,
      score: 96.0,
    },
  ];

  for (const item of sampleLeads) {
    const lead = await prisma.lead.create({
      data: {
        firstName: item.firstName,
        lastName: item.lastName,
        company: item.company,
        domain: item.domain,
        title: item.title,
        sourcePlatform: item.sourcePlatform,
        linkedinUrl: item.linkedinUrl,
        listId: leadList.id,
        emailRecords: {
          create: {
            emailAddress: item.email,
            status: item.status,
            smtpScore: item.score,
          },
        },
      },
    });
    console.log(`✓ Created Lead: ${lead.firstName} ${lead.lastName} (${lead.company})`);
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
