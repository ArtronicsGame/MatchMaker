const net = require('net');
const Redis = require('ioredis');
const axios = require('axios');

const HEROES = ["IceMan", "BlackHole", "Healer", "Tank", "Wizard", "Cloner", "Invoker", "ClockMan"];
const HEROES_INDEX = { IceMan: 0, BlackHole: 1, Healer: 2, Tank: 3, Wizard: 4, Cloner: 5, Invoker: 6, ClockMan: 7 };
const MAX_DEPTH = 6;
const MATCH_SIZE = 1;
const BOT_LIMIT = 10000;
const MATCH_PORT = 40123;

var IdMap = new Map();

var queue = [];
var user = {};

RedisDB = new Redis(6379, '5.253.27.99');

var MainHub = new Array(100);
for (var i = 0; i < 100; i++) {
    MainHub[i] = {
        flag: 0,
        IceMan: [],
        BlackHole: [],
        Healer: [],
        Tank: [],
        Wizard: [],
        Cloner: [],
        Invoker: [],
        ClockMan: [],
        inTime: Infinity
    };
}

function startMatch(group) {
    console.log("Starting Match");
    axios.post('http://localhost:1243/createMatch', { raw: group })
        .then(function (response) {
            console.log(response.data);
            var res = {
                _type: "MatchPlace",
                _info: {
                    matchPort: response.data.port,
                    matchIP: "5.253.27.99"
                }
            }
            var arr = JSON.parse(group);
            for (var i = 0; i < arr.length; i++) {
                IdMap.get(arr[i]).write(JSON.stringify(res));
                IdMap.delete(arr[i]);
            }
        })
        .catch(function (error) {
            console.log("Error On Get Match Port");
        });
}

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    while (0 !== currentIndex) {

        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function isPossible(flag) {
    var index = 0;
    var match = 0;
    while (index < HEROES.length) {
        if ((flag & (1 << index)) > 0) {
            match++;
        }
        index++;
    }
    if (match >= MATCH_SIZE)
        return true;
    return false;
}

function getPossibleMoves(flag) {
    var ans = [];
    var index = 0;
    var match = 0;
    while (index < HEROES.length) {
        if ((flag & (1 << index)) != 0) {
            match++;
            ans.push(index);
        }
        index++;
    }
    ans = shuffle(ans);
    if (match >= MATCH_SIZE)
        return ans;
    return null;
}

function probe() {
    var now = new Date().getTime();

    for (var i = 0; i < 100; i++) {
        while (isPossible(MainHub[i].flag)) {
            makeGroup(i);
        }
    }

    for (var i = 0; i < 100; i++) {
        var neccessary = true;
        while (neccessary && MainHub[i].flag) {
            neccessary = false;
            var d = now - MainHub[i].inTime;
            // console.log(d);
            if (d < BOT_LIMIT) {
                for (var j = 0; j < Math.min((d / 1000) - 1, MAX_DEPTH); j++) {
                    if (mergeAndGroup(i, j + 1)) {
                        neccessary = true;
                        break;
                    }
                }
            } else {
                //TODO: Grouping And Fill Empty Parts With Bots
                // if (mergeAndGroupBotAllowed(i)) {
                //     neccessary = true;
                //     break;
                // }
            }
        }
    }
}

function mergeAndGroup(index, lvl) {
    var budies = [];

    for (var i = 1; i < lvl; i++) {
        budies.push(index + i);
        if (index - i >= 0)
            budies.push(index - i);
    }


    var flag = MainHub[index].flag;
    for (var i = 0; i < budies.length; i++) {
        flag |= MainHub[budies[i]].flag;
    }

    if (isPossible(flag)) {
        var group = [];
        MainHub[index].inTime = Infinity;
        var Order = getPossibleMoves(flag);
        for (var i = 0; i < MATCH_SIZE; i++) {
            if (MainHub[index][HEROES[Order[i]]].length != 0) {
                group.push(MainHub[index][HEROES[Order[i]]].shift().id);
                if (MainHub[index][HEROES[Order[i]]].length == 0)
                    MainHub[index].flag ^= (1 << Order[i]);
            } else {
                for (var j = 0; j < budies.length; j++) {
                    if (MainHub[budies[j]][HEROES[Order[i]]].length != 0) {
                        var left = MainHub[budies[j]][HEROES[Order[i]]].shift();
                        group.push(left.id);
                        if (MainHub[budies[j]][HEROES[Order[i]]].length == 0)
                            MainHub[budies[j]].flag ^= (1 << Order[i]);
                        if (left.time == MainHub[budies[j]].inTime)
                            setMin(budies[j]);
                        break;
                    }
                }
            }
        }
        setMin(index);
        startMatch(JSON.stringify(group));
        return true;
    } else
        return false;
}

function setMin(index) {
    var m = Infinity;
    for (var i = 0; i < HEROES.length; i++) {
        if (MainHub[index][HEROES[i]].length != 0)
            m = Math.min(m, MainHub[index][HEROES[i]][0].time);
    }

    MainHub[index].inTime = m;
}

function makeGroup(index) {
    var group = [];
    MainHub[index].inTime = Infinity;
    var Order = getPossibleMoves(MainHub[index].flag);
    for (var i = 0; i < MATCH_SIZE; i++) {
        group.push(MainHub[index][HEROES[Order[i]]].shift().id);
        if (MainHub[index][HEROES[Order[i]]].length == 0)
            MainHub[index].flag ^= (1 << Order[i]);
    }
    setMin(index);
    startMatch(JSON.stringify(group));
}

function cancelMatch(id, socket) {
    // var data = user[info["_id"]]; // Internal Test
    RedisDB.multi([
        ['hget', id, 'Trophies'],
        ['hget', id, 'CurrentHero']
    ]).exec(function (err, raw) {
        if (err != null) {
            //TODO: Handle The Error
        }

        let trophies = parseInt(raw[0][1]);
        let currentHero = raw[1][1];

        var index = (trophies / 100) | 0;
        var heroId = (1 << this.HEROES_INDEX[currentHero]);

        for (var i = 0; i < this.MainHub[index][heroId].length; i++) {
            if (this.MainHub[index][currentHero][i].id == info["_id"]) {
                this.MainHub[index][heroId].splice(i, 1);
                if (this.MainHub[index][heroId].length == 0)
                    this.MainHub[index][heroId].flag ^= heroId;
                if (i == 0)
                    setMin(index);
                break;
            }
        }

        //TODO: Communicate To Client

    }.bind({ MainHub: MainHub, HEROES_INDEX: HEROES_INDEX }));
};

function newMatch(id, socket) { //info contains id
    // var data = user[info["_id"]]; // Internal Test

    RedisDB.multi([
        ['hget', id, 'Trophies'],
        ['hget', id, 'CurrentHero']
    ]).exec(function (err, raw) {
        if (err != null) {
            //TODO: Handle The Error
            console.log(err);
        }

        let trophies = parseInt(raw[0][1]);
        let currentHero = raw[1][1];

        var index = (trophies / 100) | 0;
        var t = new Date().getTime();
        this.MainHub[index][currentHero].push({ time: t, id: id });
        this.MainHub[index].inTime = Math.min(this.MainHub[index].inTime, t);
        this.MainHub[index].flag |= (1 << this.HEROES_INDEX[currentHero]);
    }.bind({ MainHub: MainHub, HEROES_INDEX: HEROES_INDEX }));
};

// function addToLoby(i) {
//     Match.new({ _id: i }, null);
// }


// user[0] = { _id: 0, trophies: 100, currentHero: 'Tank' };
// user[1] = { _id: 1, trophies: 50, currentHero: 'Healer' };
// user[2] = { _id: 2, trophies: 140, currentHero: 'BlackHole' };
// user[3] = { _id: 3, trophies: 120, currentHero: 'ClockMan' };
// user[4] = { _id: 4, trophies: 110, currentHero: 'IceMan' };
// user[5] = { _id: 5, trophies: 109, currentHero: 'Wizard' };
// user[6] = { _id: 6, trophies: 80, currentHero: 'Cloner' };
// user[7] = { _id: 7, trophies: 700, currentHero: 'Invoker' };

// addToLoby(0);
// console.log("--------------------------");
// addToLoby(1);
// console.log("--------------------------");
// addToLoby(2);
// console.log("--------------------------");
// addToLoby(3);
// console.log("--------------------------");
// addToLoby(4);
// console.log("--------------------------");
// addToLoby(5);
// console.log("--------------------------");
// addToLoby(6);
// console.log("--------------------------");
// addToLoby(7);
// console.log("--------------------------");
// print(3);

//#region TCP Server
var MatchServer = net.createServer(function (socket) {
    var state = false;
    socket.setNoDelay(true);

    socket.on('error', function (err) {

    });

    socket.on('end', function () {
    });

    socket.on('data', function (data) {
        var raw = JSON.parse(data.toString());
        if (raw["_type"] == "New" && !state) {
            IdMap.set(raw["_info"]["id"], socket);
            newMatch(raw["_info"]["id"], socket);
            state = true;
        } else if (raw["_type"] == "Cancel" && state) {
            IdMap.delete(raw["_info"]["id"]);
            cancelMatch(raw["_info"]["id"], socket);
            state = false;
        }
    });
});

MatchServer.listen(MATCH_PORT, function () {
    console.log(`Match Maker Server Listening On Port : ${MATCH_PORT}`);
    setInterval(probe, 1000); // Uncomment This Line To Make It Work
});
    //#endregion
