// Quick test script for Phase 1 API endpoints
const API_URL = 'http://localhost:3000/api';

async function testPhase1() {
    console.log('🧪 Testing Phase 1 API Endpoints...\n');

    try {
        // Test 1: Login
        console.log('1️⃣ Testing Login...');
        const loginResponse = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'president@tccf.org',
                password: 'password123'
            })
        });

        const loginData = await loginResponse.json();
        if (loginData.token) {
            console.log('✅ Login successful');
            console.log(`   User: ${loginData.user.name} (${loginData.user.role})`);
            console.log(`   Fellowship: ${loginData.fellowship.name}`);
            console.log(`   Token: ${loginData.token.substring(0, 20)}...`);
        } else {
            throw new Error('No token received');
        }

        const token = loginData.token;
        const fellowshipId = loginData.fellowship.id;

        // Test 2: Get Sessions
        console.log('\n2️⃣ Testing Sessions Endpoint...');
        const sessionsResponse = await fetch(`${API_URL}/sessions?fellowshipId=${fellowshipId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const sessions = await sessionsResponse.json();
        console.log(`✅ Sessions: ${sessions.length} found`);
        if (sessions.length > 0) {
            console.log(`   Active: ${sessions.find(s => s.isActive)?.name}`);
        }

        // Test 3: Get Tasks
        console.log('\n3️⃣ Testing Tasks Endpoint...');
        const tasksResponse = await fetch(`${API_URL}/tasks?fellowshipId=${fellowshipId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const tasks = await tasksResponse.json();
        console.log(`✅ Tasks: ${tasks.length} found`);

        // Test 4: Get Announcements
        console.log('\n4️⃣ Testing Announcements Endpoint...');
        const announcementsResponse = await fetch(`${API_URL}/announcements?fellowshipId=${fellowshipId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const announcements = await announcementsResponse.json();
        console.log(`✅ Announcements: ${announcements.length} found`);

        // Test 5: Get First Timers
        console.log('\n5️⃣ Testing First Timers Endpoint...');
        const firstTimersResponse = await fetch(`${API_URL}/first-timers?fellowshipId=${fellowshipId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const firstTimers = await firstTimersResponse.json();
        console.log(`✅ First Timers: ${firstTimers.length} found`);

        // Test 6: Get Prayer Requests
        console.log('\n6️⃣ Testing Prayer Requests Endpoint...');
        const prayerRequestsResponse = await fetch(`${API_URL}/prayer-requests?fellowshipId=${fellowshipId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const prayerRequests = await prayerRequestsResponse.json();
        console.log(`✅ Prayer Requests: ${prayerRequests.length} found`);

        // Test 7: Get Budgets
        console.log('\n7️⃣  Testing Budgets Endpoint...');
        const budgetsResponse = await fetch(`${API_URL}/budgets?fellowshipId=${fellowshipId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const budgets = await budgetsResponse.json();
        console.log(`✅ Budgets: ${budgets.length} found`);

        // Test 8: Get Calendar Events
        console.log('\n8️⃣ Testing Calendar Events Endpoint...');
        const calendarEventsResponse = await fetch(`${API_URL}/calendar/events?fellowshipId=${fellowshipId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const calendarEvents = await calendarEventsResponse.json();
        console.log(`✅ Calendar Events: ${calendarEvents.length} found`);

        // Test 9: Get Transactions (with receipts)
        console.log('\n9️⃣ Testing Transactions Endpoint...');
        const transactionsResponse = await fetch(`${API_URL}/transactions?fellowshipId=${fellowshipId}`);
        const transactions = await transactionsResponse.json();
        console.log(`✅ Transactions: ${transactions.length} found`);
        const pending = transactions.filter(t => t.status === 'PENDING').length;
        console.log(`   Pending approval: ${pending}`);

        console.log('\n🎉 All Phase 1 endpoints verified successfully!');
        console.log('\n✅ PHASE 1 VERIFICATION COMPLETE');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

testPhase1();
