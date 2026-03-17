1. Pick your stack

I’d use:

Node.js

Express

PostgreSQL or MySQL

EJS if you want fast server-rendered pages, or a separate frontend later

Chart.js for graphs

Stripe later for subscriptions

Express is still the standard lightweight choice for building routes and APIs, and its routing model is documented around app.get, app.post, and modular routers.

For your app, I would begin with server-rendered EJS because it is faster to launch than building a full React frontend right away.

2. Create the project

In terminal:

mkdir bankroll-app
cd bankroll-app
npm init -y
npm install express ejs dotenv express-session bcrypt
npm install mysql2
npm install --save-dev nodemon

If you want PostgreSQL instead of MySQL:

npm install pg

Node’s official docs recommend using the current supported releases and npm-based project setup.

Then in package.json, make scripts like this:

"scripts": {
  "dev": "nodemon src/server.js",
  "start": "node src/server.js"
}
3. Use a real folder structure from day one

Do not keep everything in one file.

Use this:

bankroll-app/
├── package.json
├── .env
├── src/
│   ├── server.js
│   ├── app.js
│   ├── config/
│   │   └── db.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── dashboardRoutes.js
│   │   └── betRoutes.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── dashboardController.js
│   │   └── betController.js
│   ├── services/
│   │   ├── statsService.js
│   │   └── bankrollService.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── errorMiddleware.js
│   ├── models/
│   │   ├── userModel.js
│   │   └── betModel.js
│   ├── views/
│   │   ├── partials/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   └── bets/
│   └── public/
│       ├── css/
│       └── js/

That gives you room to grow without turning the project into spaghetti.

4. Build the smallest useful version first

Your MVP should be very small.

Version 1 pages

Build only these:

Landing page

Register / login

Dashboard

Add bet page

Bet history page

Edit/delete bet

Basic stats page

Version 1 features

Only include:

user accounts

bankroll amount

add a bet

mark win/loss/push

track odds

track stake

track sport

track bet type

total profit/loss

ROI

win rate

filters by sport and date

That is enough to prove the idea.

5. Start with the database schema

You need very few tables at first.

users
id
name
email
password_hash
created_at
bankrolls
id
user_id
starting_bankroll
current_bankroll
unit_size
created_at
updated_at
bets
id
user_id
sport
bet_type
event_name
sportsbook
odds
stake
to_win
result
placed_at
settled_at
notes
created_at
updated_at
bet_tags later

For tags like:

live bet

parlay

promo

hedge

model play

Do not overbuild the schema at the start.

6. Make the first Express setup
src/server.js
require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
src/app.js
const express = require('express');
const path = require('path');
const session = require('express-session');

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const betRoutes = require('./routes/betRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/bets', betRoutes);

app.get('/', (req, res) => {
  res.render('home');
});

module.exports = app;

Express’ docs show this route-based structure clearly, and the official session middleware docs warn that the default MemoryStore is not for production and should only be used for development/debugging.

So for development, this is fine. For production, move session storage to a proper store.

7. Make the first routes
src/routes/betRoutes.js
const express = require('express');
const router = express.Router();
const betController = require('../controllers/betController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/', authMiddleware, betController.listBets);
router.get('/new', authMiddleware, betController.showNewForm);
router.post('/new', authMiddleware, betController.createBet);
router.post('/:id/update', authMiddleware, betController.updateBet);
router.post('/:id/delete', authMiddleware, betController.deleteBet);

module.exports = router;

This matches Express’ documented router pattern for modular route handling.

8. Build the app in this order

This is the order I would use:

Phase 1

create project

connect database

make users table

make bets table

register/login/logout

protect routes

Phase 2

add bet form

bet history page

dashboard cards:

total bets

wins/losses

profit/loss

ROI

Phase 3

charts

filters

edit/delete

bankroll settings

unit size tracking

Phase 4

CSV import

advanced analytics

CLV tracking

tax summaries

Stripe billing

Do not start with subscriptions first. Get a useful product first.

9. Decide whether this is MVC or layered

I would do a light layered structure:

routes = endpoints

controllers = request/response handling

services = business logic, calculations

models = DB queries

Example:

betController.createBet() handles the form submission

betModel.insertBet() writes to DB

statsService.calculateROI() handles formulas

That keeps calculations out of routes.

10. Know your core formulas early

This app lives or dies on stats being right.

At minimum:

Profit/Loss

For each bet:

win: positive return

loss: negative stake

push: 0

ROI
ROI = total profit / total amount risked
Win rate
Win rate = wins / (wins + losses)
Unit performance
Units won/lost = total profit / unit size

Keep this logic in a statsService.js.

11. Your first pages should feel clean

You do not need fancy design yet.

Just make these sections:

Dashboard

bankroll card

today / week / month profit

win/loss record

ROI

recent bets

chart of cumulative profit

Add Bet Form

sport

event

sportsbook

bet type

odds

stake

result

notes

Bet History

table with filters

edit/delete actions

That alone is enough for beta users.

12. Biggest early mistakes to avoid

Do not:

build mobile first

build sportsbook syncing first

build “AI picks” first

build social features first

overcomplicate auth

overcomplicate the schema

mix all business logic directly into route files

Also, do not try to build every betting feature at once.

Your first goal is:
Can a user log in, enter bets, and see useful stats?

If yes, you have a product foundation.

13. What to do this week

If you want to start today, do this:

Day 1

create project

install packages

create folder structure

set up Express + EJS

Day 2

connect MySQL/Postgres

create users and bets tables

Day 3

build register/login/logout

add auth middleware

Day 4

build add bet form + insert into DB

Day 5

build bet history page

Day 6

build dashboard stats

Day 7

clean up styling and bugs

That gets you to a real prototype fast.

14. My recommendation for your exact build

Given how you usually work, I would start with:

Node

Express

MySQL

EJS

Bootstrap or simple CSS

Chart.js

That is the fastest path to a working beta.

After that, if the app gets traction:

convert to API + React frontend

add Stripe

add CSV imports

then maybe sportsbook integrations

15. Best first milestone

Your first milestone should be:

“A user can create an account, add 20 bets, and see their real profit/loss, ROI, and record by sport.”

That is the right MVP.

If you want, I can give you the exact next step as a full starter boilerplate with:

folder structure

server.js

app.js

MySQL connection

auth routes

bet routes

starter EJS pages
