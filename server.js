const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;
const xss = require('xss');
const helmet = require('helmet');

const jwt = require('jsonwebtoken');
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'secret-key';
const app = express();
const PORT = 3000;


const USERS_FILE = path.join(__dirname, 'users.json');
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');
const TABLES_FILE = path.join(__dirname, 'tables.json');

app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            objectSrc: ["'none'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            frameAncestors: ["'none'"],
        },
    })
);

app.use(express.static(path.join(__dirname, 'public')));

app.use(cookieParser());

app.use(
    cors({
        origin: (origin, callback) => {
            callback(null, true);
        },
        methods: 'GET,POST,PUT,DELETE,OPTIONS',
        allowedHeaders: 'Content-Type,Authorization,csrf-token',
        credentials: true,
    })
);

app.use(bodyParser.json());

app.use(express.json());

app.get('/csrf-token', (req, res) => {
    const csrfToken = uuidv4();
    res.cookie('csrfToken', csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    });
    res.json({ csrfToken });
});

const readJSON = (filePath) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([]));
    }
    return JSON.parse(fs.readFileSync(filePath));
};

const writeJSON = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

app.post('/register', async (req, res) => {
    const email = xss(req.body.email);
    const password = xss(req.body.password);
    const validator = require('validator');

    if (!validator.isEmail(email)) {
        return res.status(400).json({ message: 'Некорректный формат email' });
    }

    if (!validator.isLength(password, { min: 8 })) {
        return res.status(400).json({ message: 'Пароль должен быть не менее 8 символов' });
    }

    if (!email || !password) {
        return res.status(400).json({ message: 'Поля email и пароль обязательны' });
    }

    const users = readJSON(USERS_FILE);
    if (users.find((user) => user.email === email)) {
        return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = {
        id: uuidv4(),
        email,
        password: hashedPassword,
        token: jwt.sign({ email }, TOKEN_SECRET, { expiresIn: '1h' }), 
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);
    res.status(201).json({ message: 'Пользователь зарегистрирован!', token: newUser.token });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const users = readJSON(USERS_FILE);

    const user = users.find((u) => u.email === email);
    if (!user) {
        return res.status(401).json({ message: 'Неверные учетные данные' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(401).json({ message: 'Неверные учетные данные' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, TOKEN_SECRET, { expiresIn: '1h' });

    user.token = token;
    writeJSON(USERS_FILE, users);

    res.status(200).json({ message: 'Успешный вход', token });
});


app.get('/tables', (req, res) => {
    const tables = readJSON(TABLES_FILE);
    res.json(tables);
});

app.get('/bookings', (req, res) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ message: 'Токен не предоставлен' });
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Токен недействителен' });
        }

        const { userId } = decoded;
        const bookings = readJSON(BOOKINGS_FILE);

        const userBookings = bookings.filter((b) => b.userId === userId);
        res.status(200).json(userBookings);
    });
});

app.post('/check-availability', (req, res) => {
    const { tableId, date, time, duration } = req.body;
    const bookings = readJSON(BOOKINGS_FILE);

    const start = parseTime(time);
    const end = start + duration * 60;

    const isAvailable = !bookings.some((b) => {
        if (b.tableId !== tableId || b.date !== date) return false;

        const bStart = parseTime(b.time);
        const bEnd = bStart + b.duration * 60;
        return !(end <= bStart || start >= bEnd);
    });

    res.json({ available: isAvailable });
});

app.post('/book', (req, res) => {
    const { token, name, date, time, duration, tableId, guests } = req.body;

    if (!date || !time || !duration || !tableId) {
        return res.status(400).json({ message: 'Все поля обязательны для заполнения' });
    }
    
    const sanitizedData = {
        name: xss(name),
        date: xss(date),
        time: xss(time),
        duration: parseInt(xss(duration), 10),
        tableId: xss(tableId),
        guests: parseInt(xss(guests), 10),
    };

    const currentDate = new Date();
    const bookingDate = new Date(sanitizedData.date);
    
    if (bookingDate < currentDate) {
        return res.status(400).json({ message: 'Невозможно забронировать стол на прошедшую дату' });
    }

    const users = readJSON(USERS_FILE);

    const user = users.find((user) => user.token === token);

    if (!user) {
        return res.status(403).json({ message: 'Неверный или отсутствующий токен' });
    }

    jwt.verify(token, TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Токен истёк или недействителен' });
        }

        const bookings = readJSON(BOOKINGS_FILE);
        const newBooking = {
            id: bookings.length + 1,
            userId: user.id,
            name,
            date: sanitizedData.date,
            time: sanitizedData.time,
            duration: sanitizedData.duration,
            tableId: sanitizedData.tableId,
            guests: sanitizedData.guests,
        };

        bookings.push(newBooking);
        writeJSON(BOOKINGS_FILE, bookings);
        res.status(201).json({ message: 'Бронирование успешно создано' });
    });
});


app.post('/cancel', (req, res) => {
    const { token, bookingId } = req.body;

    if (!token || !bookingId) {
        return res.status(400).json({ message: 'Токен и ID бронирования обязательны' });
    }

    jwt.verify(token, TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Токен истёк или недействителен' });
        }

        const { userId } = decoded; 
        const bookings = readJSON(BOOKINGS_FILE);

        const bookingIndex = bookings.findIndex(
            (booking) => booking.id === bookingId && booking.userId === userId
        );

        if (bookingIndex === -1) {
            return res.status(404).json({ message: 'Бронирование не найдено или недоступно для отмены' });
        }

        bookings.splice(bookingIndex, 1);
        writeJSON(BOOKINGS_FILE, bookings);

        res.status(200).json({ message: 'Бронирование успешно отменено.' });
    });
});


function parseTime(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}


app.post('/logout', (req, res) => {
    const { token } = req.body; 
    const users = readJSON(USERS_FILE);

    const user = users.find((u) => u.token === token);
    if (!user) {
        return res.status(403).json({ message: 'Неверный токен' });
    }

    res.status(200).json({ message: 'Выход выполнен успешно' });
});


app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});

