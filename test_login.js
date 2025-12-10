

async function testLogin() {
    try {
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'finance@tccf.org', password: 'password123' })
        });
        const data = await response.json();
        console.log('Login Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testLogin();
