const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('./utils/auth');
const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create TCCF Fellowship with extended fields
    const tccf = await prisma.fellowship.upsert({
        where: { code: 'TCCF' },
        update: {},
        create: {
            name: 'The Community Christian Fellowship',
            code: 'TCCF',
            address: 'University Campus, Main Auditorium',
            school: 'Federal University of Technology'
        }
    });
    console.log('✅ Fellowship created');

    // Hash passwords for all users
    const defaultPassword = await hashPassword('password123');

    // Seed Users with hashed passwords
    const president = await prisma.user.upsert({
        where: { email: 'president@tccf.org' },
        update: {},
        create: {
            name: 'Fellowship President',
            email: 'president@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'PRESIDENCY',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const finance = await prisma.user.upsert({
        where: { email: 'finance@tccf.org' },
        update: {},
        create: {
            name: 'Financial Secretary',
            email: 'finance@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'FINANCE',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const organizing = await prisma.user.upsert({
        where: { email: 'organizing@tccf.org' },
        update: {},
        create: {
            name: 'Organizing Secretary',
            email: 'organizing@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'ORGANIZING',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const music = await prisma.user.upsert({
        where: { email: 'music@tccf.org' },
        update: {},
        create: {
            name: 'Music Director',
            email: 'music@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'MUSIC',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const protocol = await prisma.user.upsert({
        where: { email: 'protocol@tccf.org' },
        update: {},
        create: {
            name: 'Protocol Director',
            email: 'protocol@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'PROTOCOL',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const media = await prisma.user.upsert({
        where: { email: 'media@tccf.org' },
        update: {},
        create: {
            name: 'Media Director',
            email: 'media@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'MEDIA',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const vicePresident = await prisma.user.upsert({
        where: { email: 'vp@tccf.org' },
        update: {},
        create: {
            name: 'Vice President',
            email: 'vp@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'VICE_PRESIDENCY',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const secretaryGeneral = await prisma.user.upsert({
        where: { email: 'secretary@tccf.org' },
        update: {},
        create: {
            name: 'Secretary General',
            email: 'secretary@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'SECRETARY_GENERAL',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const assistantSecretary = await prisma.user.upsert({
        where: { email: 'asstsec@tccf.org' },
        update: {},
        create: {
            name: 'Assistant Secretary General',
            email: 'asstsec@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'ASSISTANT_SECRETARY',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const evangelism = await prisma.user.upsert({
        where: { email: 'evangelism@tccf.org' },
        update: {},
        create: {
            name: 'Evangelism/Follow-up Director',
            email: 'evangelism@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'EVANGELISM',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const brothersCord = await prisma.user.upsert({
        where: { email: 'brothers@tccf.org' },
        update: {},
        create: {
            name: 'Brothers Coordinator',
            email: 'brothers@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'BROTHERS_CORD',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const sistersCord = await prisma.user.upsert({
        where: { email: 'sisters@tccf.org' },
        update: {},
        create: {
            name: 'Sisters Coordinator',
            email: 'sisters@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'SISTERS_CORD',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const welfare = await prisma.user.upsert({
        where: { email: 'welfare@tccf.org' },
        update: {},
        create: {
            name: 'Welfare Director',
            email: 'welfare@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'WELFARE',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const prayer = await prisma.user.upsert({
        where: { email: 'prayer@tccf.org' },
        update: {},
        create: {
            name: 'Prayer Director',
            email: 'prayer@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'PRAYER',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const bibleStudy = await prisma.user.upsert({
        where: { email: 'biblestudy@tccf.org' },
        update: {},
        create: {
            name: 'Bible Study Director',
            email: 'biblestudy@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'BIBLE_STUDY',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const treasurer = await prisma.user.upsert({
        where: { email: 'treasurer@tccf.org' },
        update: {},
        create: {
            name: 'Treasurer',
            email: 'treasurer@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'TREASURER',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const academic = await prisma.user.upsert({
        where: { email: 'academic@tccf.org' },
        update: {},
        create: {
            name: 'Academic Unit Director',
            email: 'academic@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'ACADEMIC',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const library = await prisma.user.upsert({
        where: { email: 'library@tccf.org' },
        update: {},
        create: {
            name: 'Library Unit Director',
            email: 'library@tccf.org',
            password: defaultPassword,
            role: 'EXECUTIVE',
            department: 'LIBRARY',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    // Super Admin (System Administrator)
    const superAdmin = await prisma.user.upsert({
        where: { email: 'admin@tccf.org' },
        update: {},
        create: {
            name: 'System Administrator',
            email: 'admin@tccf.org',
            password: defaultPassword,
            role: 'SUPER_ADMIN',
            department: 'ADMIN',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });

    const worker = await prisma.user.upsert({
        where: { email: 'worker@tccf.org' },
        update: {},
        create: {
            name: 'Music Worker',
            email: 'worker@tccf.org',
            password: defaultPassword,
            role: 'WORKER',
            department: 'MUSIC',
            fellowshipId: tccf.id,
            isVerified: true
        }
    });
    console.log('✅ Users created (all passwords: password123)');

    // Create Academic Session
    await prisma.session.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: '2024/2025',
            startDate: new Date('2024-09-01'),
            endDate: new Date('2025-06-30'),
            isActive: true,
            fellowshipId: tccf.id
        }
    });
    console.log('✅ Session created');

    // Create Events
    await prisma.event.deleteMany({});
    await prisma.event.createMany({
        data: [
            {
                title: 'Sunday Worship Service',
                date: 'Sunday, Dec 15, 2024',
                time: '10:00 AM',
                location: 'Main Sanctuary',
                type: 'Service',
                status: 'UPCOMING',
                fellowshipId: tccf.id
            },
            {
                title: 'Midweek Bible Study',
                date: 'Wednesday, Dec 18, 2024',
                time: '7:00 PM',
                location: 'Fellowship Hall',
                type: 'Study',
                status: 'UPCOMING',
                fellowshipId: tccf.id
            },
            {
                title: 'Youth Connect',
                date: 'Saturday, Dec 21, 2024',
                time: '2:00 PM',
                location: 'Youth Center',
                type: 'Youth',
                status: 'UPCOMING',
                fellowshipId: tccf.id
            }
        ]
    });
    console.log('✅ Events created');

    // Create Resources
    await prisma.resource.deleteMany({});
    await prisma.resource.createMany({
        data: [
            {
                title: 'Sunday Bulletin - Dec 15',
                type: 'PDF',
                url: '/resources/bulletin-dec-15.pdf',
                size: '1.2 MB',
                fellowshipId: tccf.id
            },
            {
                title: 'Walking in Faith - Sermon Series',
                type: 'Video',
                url: '/resources/sermon-walking-in-faith.mp4',
                size: '145 MB',
                fellowshipId: tccf.id
            },
            {
                title: 'Worship Songs Collection',
                type: 'Audio',
                url: '/resources/worship-collection.mp3',
                size: '65 MB',
                fellowshipId: tccf.id
            }
        ]
    });
    console.log('✅ Resources created');

    // Create Tasks
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    await prisma.task.deleteMany({});
    await prisma.task.createMany({
        data: [
            {
                title: 'Prepare worship songs for Sunday',
                description: 'Select 5 worship songs and prepare lyrics slides',
                deadline: tomorrow,
                priority: 'HIGH',
                status: 'PENDING',
                assignedToId: music.id,
                createdById: organizing.id,
                fellowshipId: tccf.id
            },
            {
                title: 'Confirm venue booking',
                description: 'Confirm and pay for Youth Connect venue',
                deadline: nextWeek,
                priority: 'MEDIUM',
                status: 'IN_PROGRESS',
                assignedToId: organizing.id,
                createdById: president.id,
                fellowshipId: tccf.id
            }
        ]
    });
    console.log('✅ Tasks created');

    // Create Announcements
    await prisma.announcement.deleteMany({});
    await prisma.announcement.createMany({
        data: [
            {
                title: 'Welcome to the New Session!',
                content: 'We are excited to begin the 2024/2025 academic session. Let us come together in faith and fellowship.',
                targetRoles: JSON.stringify([]),
                targetDepts: JSON.stringify([]),
                sendPush: false,
                sendSMS: false,
                sendWhatsApp: false,
                createdById: president.id,
                fellowshipId: tccf.id
            },
            {
                title: 'Music Team Rehearsal - This Saturday',
                content: 'All music team members are required to attend rehearsal on Saturday at 4 PM.',
                targetRoles: JSON.stringify(['WORKER', 'EXECUTIVE']),
                targetDepts: JSON.stringify(['MUSIC']),
                sendPush: false,
                sendSMS: false,
                sendWhatsApp: false,
                createdById: music.id,
                fellowshipId: tccf.id
            }
        ]
    });
    console.log('✅ Announcements created');

/*  DISABLED: FirstTimer & FollowUp seeding - Foreign key constraint issue
// Create First Timers
await prisma.firstTimer.deleteMany({});
const firstTimer1 = await prisma.firstTimer.create({
    data: {
        name: 'John Doe',
        phone: '+2348012345678',
        email: 'john.doe@example.com',
        address: 'Hall 3, Room 205',
        howHeard: 'Friend invitation',
        fellowshipId: tccf.id
    }
});

const firstTimer2 = await prisma.firstTimer.create({
    data: {
        name: 'Jane Smith',
        phone: '+2348087654321',
        email: 'jane.smith@example.com',
        howHeard: 'Social media',
        followedUp: false,
        fellowshipId: tccf.id
    }
});
console.log('✅ First timers created');

// Create Follow-ups
await prisma.followUp.deleteMany({});
await prisma.followUp.create({
    data: {
        firstTimerId: firstTimer1.id,
        agentId: protocol.id,
        notes: 'Called and welcomed. Interested in joining choir.',
        nextAction: 'Introduce to music director'
    }
});
console.log('✅ Follow-ups created');

// Create Prayer Requests
await prisma.prayerRequest.deleteMany({});
await prisma.prayerRequest.createMany({
    data: [
        {
            requestorName: 'Mary Johnson',
            request: 'Pray for healing from illness',
            status: 'PENDING',
            isAnonymous: false,
            fellowshipId: tccf.id
        },
        {
            requestorName: 'Anonymous',
            request: 'Financial breakthrough for my family',
            status: 'PENDING',
            isAnonymous: true,
            fellowshipId: tccf.id
        }
    ]
});
console.log('✅ Prayer requests created');

// Create Budget
await prisma.budget.deleteMany({});
await prisma.budget.createMany({
    data: [
        {
            title: 'December Monthly Budget',
            amount: 150000.00,
            period: 'Monthly',
            status: 'APPROVED',
            approvedBy: president.id,
            approvedAt: new Date(),
            fellowshipId: tccf.id
        },
        {
            title: 'Music Department - Q1 2025',
            amount: 75000.00,
            period: 'Quarterly',
            department: 'MUSIC',
            status: 'SUBMITTED',
            fellowshipId: tccf.id
        }
    ]
});
console.log('✅ Budgets created');

// Create Calendar Events
await prisma.calendarEvent.deleteMany({});
await prisma.calendarEvent.createMany({
    data: [
        {
            title: 'End of Semester Exams',
            date: new Date('2024-12-20'),
            description: 'Final exams begin',
            type: 'Exam',
            fellowshipId: tccf.id
        },
        {
            title: 'Christmas Break',
            date: new Date('2024-12-24'),
            description: 'Campus closes for Christmas',
            type: 'Holiday',
            fellowshipId: tccf.id
        },
        {
            title: 'New Year Crossover Service',
            date: new Date('2024-12-31'),
            description: 'Special crossover service at 10 PM',
            type: 'Fellowship Event',
            fellowshipId: tccf.id
        }
    ]
});
console.log('✅ Calendar events created');

// Create Transactions
await prisma.transaction.deleteMany({});
await prisma.transaction.createMany({
    data: [
        {
            type: 'INCOME',
            category: 'TITHE',
            amount: 50000.00,
            description: 'Sunday Service Tithes - Dec 8',
            status: 'APPROVED',
            approvedBy: president.id,
            approvedAt: new Date(),
            fellowshipId: tccf.id
        },
        {
            type: 'INCOME',
            category: 'OFFERING',
            amount: 25000.00,
            description: 'Sunday Service Offerings - Dec 8',
            status: 'APPROVED',
            approvedBy: president.id,
            approvedAt: new Date(),
            fellowshipId: tccf.id
        },
        {
            type: 'EXPENSE',
            category: 'LOGISTICS',
            amount: 5000.00,
            description: 'Cleaning Supplies',
            status: 'PENDING',
            fellowshipId: tccf.id
        },
        {
            type: 'EXPENSE',
            category: 'EQUIPMENT',
            amount: 25000.00,
            description: 'PA System Repair',
            status: 'PENDING',
            fellowshipId: tccf.id
        }
    ]
});
console.log('✅ Transactions created');

// Create Songs
await prisma.song.deleteMany({});
await prisma.song.createMany({
    data: [
        {
            title: 'How Great Is Our God',
            artist: 'Chris Tomlin',
            key: 'C',
            link: 'https://www.youtube.com/watch?v=example1',
            fellowshipId: tccf.id
        },
        {
            title: 'Reckless Love',
            artist: 'Cory Asbury',
            key: 'G',
            link: 'https://www.youtube.com/watch?v=example2',
            fellowshipId: tccf.id
        },
        {
            title: 'Goodness of God',
            artist: 'Bethel Music',
            key: 'D',
            link: 'https://www.youtube.com/watch?v=example3',
            fellowshipId: tccf.id
        }
    ]
});
console.log('✅ Songs created');

// Create Attendance Records
await prisma.attendance.deleteMany({});
await prisma.attendance.createMany({
    data: [
        {
            menCount: 45,
            womenCount: 52,
            childrenCount: 8,
            total: 105,
            serviceType: 'Sunday Service',
            date: new Date('2024-12-01'),
            fellowshipId: tccf.id
        },
        {
            menCount: 30,
            womenCount: 35,
            childrenCount: 5,
            total: 70,
            serviceType: 'Bible Study',
            date: new Date('2024-12-04'),
            fellowshipId: tccf.id
        }
    ]
});
console.log('✅ Attendance records created');

// Create Media Posts
await prisma.mediaPost.deleteMany({});
await prisma.mediaPost.createMany({
    data: [
        {
            platform: 'Instagram',
            content: 'Join us this Sunday for an amazing worship experience! 10 AM at the Main Sanctuary.',
            status: 'Posted',
            scheduledDate: '2024-12-10',
            fellowshipId: tccf.id
        },
        {
            platform: 'Facebook',
            content: 'Youth Connect is happening this Saturday! All youths are invited.',
            status: 'Scheduled',
            scheduledDate: '2024-12-18',
            fellowshipId: tccf.id
        }
    ]
});
console.log('✅ Media posts created');

console.log('\n✨ Database seeded successfully!');
console.log('\n📝 Test Credentials:');
console.log('   President: president@tccf.org / password123');
console.log('   Finance: finance@tccf.org / password123');
console.log('   Organizing: organizing@tccf.org / password123');
console.log('   Music: music@tccf.org / password123');
console.log('   Protocol: protocol@tccf.org / password123');
console.log('   Media: media@tccf.org / password123');
console.log('   Worker: worker@tccf.org / password123');
console.log('   Fellowship Code: TCCF');
}

main()
.then(async () => {
    await prisma.$disconnect();
})
.catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
});
