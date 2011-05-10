var http    = require('http'), 
    io      = require('socket.io'),
    cp      = require('child_process'),
    utils   = require('./utils');

server = utils.start_server(8080, './index.html')
 
var max_players = 8
var boss = null
var turns = 0
var SUPERPOWERS = 3
var POWERS = 2
var game_over = false

var players = [];
var fired = [];
var targets = [];
var turn_target = {};
var seconds_for_turn = 10;
function seats_available() {return players.length < max_players;}

io.listen(server).on('connection', function (client) {

	client.send({nickname: {question: "What is your nickname?", suggest: ('' + client.sessionId).substring(0,5)}});
    
	client.on('disconnect', function(){
        client.broadcast({message: client.sessionId + ' disconnected' })
	});

    // Listen to players' messages (so far only one: when they target someone)
    client.on('message', function(msg){ 
        if(msg.nickname !== undefined) {
            // First we ask for the nickname and add the player, start the game
            client.nickname = msg.nickname;
            // Add the new player if there are seats available
            if(seats_available()) { 
                players.push(client)
                targets.push([])
                var seat = players.length - 1
                console.log("New player at seat " + seat)
            	client.send({new_player: {total_seats: max_players, nicknames: players.map(function(p) {return p.nickname}).join(), my_seat: seat}});
                client.broadcast({seat_taken: {seat: seat, nickname: client.nickname}})
            }

            // Start the game if there are no seats available
            if(!seats_available()) { 
                console.log("Game started")
                // Decide who is the boss
                client.listener.broadcast({flash: "Deciding who is the boss"});
                boss = players[Math.floor(Math.random()*max_players)]
                boss.send({role: {is_boss: true}})
                boss.broadcast({role: {is_boss: false}})
                start_turn();
            }
            
        } else if(msg.target !== undefined) {
            // A message with 'target' is sent by a player who g an
            // opponent. The value of 'target' is the position in the table
            var player_pos = players.indexOf(client);
            var target_pos = parseInt(msg.target);
            console.log("Player " + player_pos + " targets " + target_pos);
            if (target_pos in turn_target) // someone already targeted!
                // TODO: Manage conflicts
                client.send({message: "Choose someone else."})
            else {
                turn_target[target_pos] = player_pos
                client.broadcast({target_taken: target_pos})
            }
        } else {
            console.log("Unrecognized message: " + JSON.stringify(msg))
        }      
    });

    // Grant each player a slot of time to pick an opponent
    function start_turn() {
        turns += 1
        // console.log("Turn " + turns + " started")
        // Allow players in game to play
        for(var i = 0; i < players.length; i++) {
            var was_fired = (fired.indexOf('' + i) > -1);
            if(!was_fired) {
                players[i].send({flash: "Turn " + turns + " started"});
                players[i].send({turn: "start"});
            }
        }
    	// Tell everyone the turn has started (even players not in play)
    	// Maybe not a good idea, would hide the "you lost" message
        // client.listener.broadcast({flash: "Turn " + turns + " started"});
        cp.spawn('sleep', [seconds_for_turn]).on('exit', end_turn);
    }

    // Calculate the outcome of all the players' choices
    function end_turn(code){
        // console.log("Turn " + turns + " ended")
    	// Tell everyone the turn has ended (even players not in play)
        client.listener.broadcast({turn: "end"});
        // TODO: check for conflicts

    	for(var i = 0; i < players.length; i++) {
    	    var p = players[i]
    	    log = "* Turn " + turns + " | Seat " + i 
            log += " | Targeted by: "
            log += turn_target[i]
    	    log += " | Status: "
    	    log += ((fired.indexOf('' + i) > -1) ? "dead!" : "alive")
            log += " | Targets: "
            log += targets[i]
            log += " | Powers: "
            log += (targets[i].diff(fired)).length
            console.log(log)
    	}

        // calculate outcome
        for(var target_pos in turn_target) {
            var player_pos = turn_target[target_pos]
            var player = players[player_pos]
            var target = players[target_pos]
            // The next IF is in case the boss killed it meanwhile
            if((fired.indexOf('' + player_pos) > -1 || fired.indexOf('' + target_pos) > -1)) continue
            // console.log("Player " + player_pos + " targets " + target_pos)
            // listener.broadcast({message: player_pos + " has targeted " + target_pos});
            // TODO: the order is FIRST the boss? Or as they were assigned?
            // for now is the arrival order I guess (associate arrays anyone?)
            var opponent = null
            if(player == boss) {opponent = target; opponent_pos=target_pos; boss_pos=player_pos}
            if(target == boss) {opponent = player; opponent_pos=player_pos; boss_pos=target_pos}
            if(opponent) {
                powers = (targets[opponent_pos].diff(fired)).length
                if ((target == boss && powers >= POWERS) || (player == boss && powers == SUPERPOWERS)) {// boss touched me but I have sp
                    // The next IF is in case the boss killed it meanwhile
                    if(!(fired.indexOf('' + boss_pos) > -1)) {
                        console.log("Boss at " + boss_pos + " overthrown by player at " + opponent_pos)
                        boss.send({message: "You were overthrown!"})
                        opponent.send({outcome: "win"})
                        opponent.broadcast({outcome: "lose"})
                        opponent.broadcast({message: "Won: " + opponent_pos})
                        fired.push('' + boss_pos) 
                    } 
                    game_over = true
                } else {
                    // The next IF is in case the boss killed it meanwhile
                    if(!(fired.indexOf('' + opponent_pos) > -1)) {
                        console.log("Boss at " + boss_pos + " kills player at " + opponent_pos)
                        boss.send({message: "You fired someone"})
                        opponent.send({outcome: "lose"})
                        opponent.send({fired: '' + opponent_pos}) // NOTE: This should be integrated with the previous
                        opponent.broadcast({fired: '' + opponent_pos})
                        fired.push('' + opponent_pos)
                    }
                    if (players.length - fired.length <= 1) {
                        boss.send({outcome: "win"})
                        game_over = true
                    }
                }
            } else { // if(player != boss && target != boss)
                // DOUBT! If an employee touches me, does it count? Guess not.
                console.log("Friends at " + target_pos + " and " + player_pos)
                player.send({friend: target_pos})
                targets[player_pos].push(target_pos)
            }
        }

        // Check if the game is over
        if(game_over) {
            console.log("Game over")
            client.listener.broadcast({message: "Game over!"});
        }
        else {// start next turn
            boss.broadcast({powers: {medium: POWERS, high: SUPERPOWERS}})
            turn_target = {};
            start_turn()
        }        
    }
});
