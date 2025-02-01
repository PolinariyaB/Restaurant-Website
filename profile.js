let csrfToken='';
document.addEventListener('DOMContentLoaded', async () => {
    
    console.log('DOM загружен');

    const choiceSection = document.getElementById('choice-section');
    const loginSection = document.getElementById('login-section');
    const registerSection = document.getElementById('register-section');
    const userInfoSection = document.getElementById('user-info-section');
    const userEmailSpan = document.getElementById('user-email');
    const bookingList = document.getElementById('booking-list');
    const logoutButton = document.getElementById('logout');

    
    const userEmail = localStorage.getItem('email');

    if (userEmail) {
        console.log('Пользователь авторизован:', userEmail);
        
        choiceSection?.classList.remove('active');
        userInfoSection?.classList.add('active');
        userEmailSpan.textContent = userEmail;
        if (localStorage.getItem('authToken')) {
            loadBookings()
    
        }
    } else {
        console.log('Пользователь не авторизован');
        choiceSection?.classList.add('active');
        userInfoSection?.classList.remove('active');
    }

    async function fetchCsrfToken() {
        try {
            const response = await fetch('http://localhost:3000/csrf-token', {
                method: 'GET',
                credentials: 'include',
            });
    
            if (!response.ok) {
                throw new Error(`Ошибка получения CSRF-токена: ${response.status}`);
            }
    
            const data = await response.json();
            return data.csrfToken;
        } catch (error) {
            console.error('Ошибка:', error);
            throw error;
        }
    }
    

    document.getElementById('to-login')?.addEventListener('click', () => {
        choiceSection?.classList.remove('active');
        loginSection?.classList.add('active');
    });

    function loadBookings() {
        const authToken = localStorage.getItem('authToken');
        fetch('http://localhost:3000/bookings', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
        })
            .then((response) => {
                if (!response.ok) throw new Error('Ошибка загрузки бронирований');
                return response.json();
            })
            .then((bookings) => {
                const bookingList = document.getElementById('booking-list');
                while (bookingList.firstChild) {
                    bookingList.removeChild(bookingList.firstChild);
                }
    
                if (bookings.length > 0) {
                    bookings.forEach((booking) => {
                        const listItem = document.createElement('li');

                        const nameElement = document.createElement('strong');
                        nameElement.textContent = 'Имя: ';
                        const nameText = document.createElement('span');
                        nameText.textContent = booking.name;
                        listItem.appendChild(nameElement);
                        listItem.appendChild(nameText);
                        listItem.appendChild(document.createElement('br'));

                        const dateElement = document.createElement('strong');
                        dateElement.textContent = 'Дата: ';
                        const dateText = document.createElement('span');
                        dateText.textContent = booking.date;
                        listItem.appendChild(dateElement);
                        listItem.appendChild(dateText);
                        listItem.appendChild(document.createElement('br'));

                        const timeElement = document.createElement('strong');
                        timeElement.textContent = 'Время: ';
                        const timeText = document.createElement('span');
                        timeText.textContent = booking.time;
                        listItem.appendChild(timeElement);
                        listItem.appendChild(timeText);
                        listItem.appendChild(document.createElement('br'));

                        const tableElement = document.createElement('strong');
                        tableElement.textContent = 'Столик: ';
                        const tableText = document.createElement('span');
                        tableText.textContent = booking.tableId;
                        listItem.appendChild(tableElement);
                        listItem.appendChild(tableText);
                        listItem.appendChild(document.createElement('br'));

                        const cancelButton = document.createElement('button');
                        cancelButton.textContent = 'Отменить';
                        cancelButton.classList.add('cancel-booking');
                        cancelButton.setAttribute('data-id', booking.id);

                        listItem.appendChild(cancelButton);

                        bookingList.appendChild(listItem);

                        cancelButton.addEventListener('click', (event) => {
                            const bookingId = event.target.dataset.id;
                            cancelBooking(bookingId);
                        });
                        bookingList.appendChild(listItem);
                    });
    
                    document.querySelectorAll('.cancel-booking').forEach((button) => {
                        button.addEventListener('click', (event) => {
                            const bookingId = event.target.dataset.id;
                            cancelBooking(bookingId);
                        });
                    });
                } else {
                    const noBookingsMessage = document.createElement('p');
                    noBookingsMessage.textContent = 'У вас нет бронирований.';  
                    bookingList.appendChild(noBookingsMessage); 
                }
            })
            .catch((error) => {
                console.error('Ошибка загрузки бронирований:', error);
            });
    }
    

    document.getElementById('to-register')?.addEventListener('click', () => {
        choiceSection?.classList.remove('active');
        registerSection?.classList.add('active');
    });

    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
    
        const email = document.getElementById('email-login').value;
        const password = document.getElementById('password-login').value;
    
        try {
            const response = await fetch('http://localhost:3000/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include',
            });
    
            const result = await response.json();
            if (response.ok) {
                localStorage.setItem('authToken', result.token);
                localStorage.setItem('email', email);
                window.location.href = 'profile.html';
            } else {
                alert(result.message || 'Ошибка входа');
            }

        } catch (error) {
            console.error('Ошибка при входе:', error);
        }
    });
    

    document.getElementById('register-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
    
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
    
        try {
            const response = await fetch('http://localhost:3000/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });
    
            const result = await response.json();
            if (response.ok) {
                localStorage.setItem('authToken', result.token);
                localStorage.setItem('email', email);
                window.location.href = 'profile.html';
            } else {
                alert(result.message || 'Ошибка регистрации');
            }
        } catch (error) {
            console.error('Ошибка при регистрации:', error);
        }
    });

    function cancelBooking(bookingId) {
        const authToken = localStorage.getItem('authToken');
        fetch('http://localhost:3000/cancel', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: authToken, bookingId: parseInt(bookingId, 10) }),
        })
            .then((response) => {
                if (!response.ok) throw new Error('Ошибка отмены бронирования');
                return response.json();
            })
            .then((result) => {
                alert(result.message);
                loadBookings(); 
            })
            .catch((error) => {
                console.error('Ошибка при отмене бронирования:', error);
            });
    }

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('userId');
        localStorage.removeItem('email');
        window.location.href = 'index.html';
    });

    await fetchCsrfToken();
    if (localStorage.getItem('authToken')) {
        loadBookings();
    }
    
});
