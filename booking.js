let csrfToken = localStorage.getItem('csrfToken');

document.addEventListener('DOMContentLoaded', async () => {
    const bookingForm = document.getElementById('booking-form');
    const successMessage = document.getElementById('success-message');
    const userToken = localStorage.getItem('authToken');
    const guestCountElement = document.getElementById('guest-count');
    const increaseButton = document.getElementById('increase-guests');
    const decreaseButton = document.getElementById('decrease-guests');
    const timeInput = document.getElementById('time');

    if (!userToken) {
        alert('Вы не авторизованы. Перенаправление на страницу входа.');
        window.location.href = 'profile.html';
        return;
    }

    if (!bookingForm) {
        console.error('Форма бронирования не найдена!');
        return;
    }

    if (!csrfToken) {
        try {
            const csrfResponse = await fetch('http://localhost:3000/csrf-token', {
                credentials: 'include',
            });

            if (!csrfResponse.ok) {
                throw new Error(`Ошибка сервера: ${csrfResponse.status} ${csrfResponse.statusText}`);
            }

            const csrfData = await csrfResponse.json();
            csrfToken = csrfData.csrfToken;
            localStorage.setItem('csrfToken', csrfToken); 


        } catch (error) {
            console.error('Ошибка получения CSRF-токена:', error.message);
            alert('Не удалось получить CSRF-токен. Попробуйте позже.');
            return;
        }
    }

    async function findAvailableTable(date, time, duration, guests) {
        try {
            const response = await fetch('http://localhost:3000/tables', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'CSRF-Token': csrfToken,
                    Authorization: `Bearer ${userToken}`,
                },
                credentials: 'include',
            });

            if (!response.ok) throw new Error('Ошибка при загрузке списка столов.');

            const tables = await response.json();
            for (const table of tables) {
                if (table.capacity >= guests) {
                    const checkResponse = await fetch('http://localhost:3000/check-availability', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'CSRF-Token': csrfToken,
                            Authorization: `Bearer ${userToken}`,
                        },
                        body: JSON.stringify({ tableId: table.tableId, date, time, duration }),
                        credentials: 'include',
                    });

                    if (!checkResponse.ok) throw new Error('Ошибка при проверке доступности стола.');

                    const { available } = await checkResponse.json();
                    if (available) return table.tableId;
                }
            }
            return null;
        } catch (error) {
            console.error('Ошибка проверки доступности стола:', error.message);
            return null;
        }
    }
    let guestCount = 1;
    
    timeInput.addEventListener('change', () => {
        const [hours, minutes] = timeInput.value.split(':').map(Number);
    
        if (minutes !== 0) {
            const correctedTime = `${String(hours).padStart(2, '0')}:00`;
            timeInput.value = correctedTime;
        }
    });

    increaseButton.addEventListener('click', () => {
        if (guestCount < 6) {
            guestCount++;
            guestCountElement.textContent = guestCount;
        } else {
            alert('Максимальное количество гостей: 6.');
        }
    });
    
    decreaseButton.addEventListener('click', () => {
        if (guestCount > 1) {
            guestCount--;
            guestCountElement.textContent = guestCount;
        }
    });

    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value;
        const date = document.getElementById('date').value;
        const time = document.getElementById('time').value;
        const guests = guestCount;
        const duration = 3;

        if (!name || !date || !time || !guests) {
            alert('Пожалуйста, заполните все поля формы!');
            return;
        }

        const tableId = await findAvailableTable(date, time, duration, guests);
        if (!tableId) {
            alert('Нет доступных столов на указанное время.');
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/book', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'CSRF-Token': csrfToken,
                    Authorization: `Bearer ${userToken}`, // JWT-токен
                },
                body: JSON.stringify({
                    token: userToken,
                    name,
                    date,
                    time,
                    guests,
                    duration,
                    tableId,
                }),
                credentials: 'include',
            });

            const result = await response.json();
            if (response.ok) {
                successMessage.textContent = result.message;
                successMessage.style.display = 'block';
                bookingForm.reset();
                loadBookings();
            } else {
                alert(result.message || 'Не удалось выполнить бронирование.');
            }
        } catch (error) {
            console.error('Ошибка при бронировании:', error.message);
        }
    });
});