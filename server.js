const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.static('public'));

let gameRoom = null; 

io.on('connection', (socket) => {
  socket.on('createGame', (config) => {
    gameRoom = { 
      hostId: socket.id, players: [], questions: config.questions, 
      maxTeams: config.teams, currentState: 'LOBBY', currentQIndex: -1      
    };
    socket.join('MAIN_ROOM');
    socket.emit('gameCreated', config.teams); 
  });

  socket.on('joinGame', (data) => {
    const { team, name } = data;
    if (gameRoom) {
      const existingPlayer = gameRoom.players.find(p => p.team == team && p.name === name);

      if (existingPlayer) {
        existingPlayer.id = socket.id;
        socket.join('MAIN_ROOM');
        socket.emit('joinSuccess');
        io.to(gameRoom.hostId).emit('updateLobby', gameRoom.players);
        io.to(gameRoom.hostId).emit('updateScores', gameRoom.players);
        console.log(`[재연결 성공] ${team}조 ${name} 학생이 기존 자리를 이어받았습니다.`);
        return; 
      }

      const teamPlayers = gameRoom.players.filter(p => p.team == team);
      if (teamPlayers.length >= 4) return socket.emit('joinError', '해당 모둠은 이미 4명이 꽉 찼습니다!');

      let availableSlot = 0;
      for (let i = 0; i < 4; i++) {
        if (!teamPlayers.find(p => p.slot == i)) { availableSlot = i; break; }
      }

      gameRoom.players.push({ id: socket.id, team, slot: availableSlot, name, answer: "", score: 0 }); 
      socket.join('MAIN_ROOM');
      socket.emit('joinSuccess');
      io.to(gameRoom.hostId).emit('updateLobby', gameRoom.players);
    }
  });

  socket.on('changePlayerSlot', (data) => {
    const { playerId, newSlot } = data;
    if (!gameRoom) return;
    const player = gameRoom.players.find(p => p.id === playerId);
    if (player) {
      const existingPlayer = gameRoom.players.find(p => p.team == player.team && p.slot == newSlot);
      if (existingPlayer) existingPlayer.slot = player.slot;
      player.slot = newSlot;
      io.to(gameRoom.hostId).emit('updateLobby', gameRoom.players);
    }
  });

  // [신규] 호스트가 플레이어를 대기 명단에서 명시적으로 삭제(제외)할 때
  socket.on('removePlayer', (data) => {
    const { playerId } = data;
    if (!gameRoom) return;

    // 해당 플레이어를 명단에서 제거
    gameRoom.players = gameRoom.players.filter(p => p.id !== playerId);
    
    // 갱신된 명단을 다시 호스트에게 전송하여 화면을 새로 그리게 함
    io.to(gameRoom.hostId).emit('updateLobby', gameRoom.players);
    console.log(`[플레이어 삭제] ID: ${playerId} 번 학생이 명단에서 제외되었습니다.`);
  });

  socket.on('nextState', () => {
    if (!gameRoom) return;

    if (gameRoom.currentState === 'LOBBY' || gameRoom.currentState === 'RESULT') {
      gameRoom.currentState = 'Q_NUM'; 
      gameRoom.currentQIndex++;        
      gameRoom.players.forEach(p => p.answer = ""); 
      
      io.to(gameRoom.hostId).emit('updateHostScreen', {
        state: gameRoom.currentState, qIndex: gameRoom.currentQIndex,
        questionText: gameRoom.questions[gameRoom.currentQIndex], players: gameRoom.players, maxTeams: gameRoom.maxTeams
      });
      io.to('MAIN_ROOM').emit('updatePlayerScreen', { state: gameRoom.currentState });

    } else if (gameRoom.currentState === 'Q_NUM') {
      gameRoom.currentState = 'Q_TEXT'; 
      
      io.to(gameRoom.hostId).emit('updateHostScreen', {
        state: gameRoom.currentState, qIndex: gameRoom.currentQIndex,
        questionText: gameRoom.questions[gameRoom.currentQIndex], players: gameRoom.players, maxTeams: gameRoom.maxTeams,
        timerState: 'PREP'
      });
      io.to('MAIN_ROOM').emit('updatePlayerScreen', { state: 'Q_TEXT_PREP' });

      setTimeout(() => {
        if (gameRoom.currentState !== 'Q_TEXT') return; 
        io.to(gameRoom.hostId).emit('startTimer', 10);
        io.to('MAIN_ROOM').emit('updatePlayerScreen', { state: 'Q_TEXT_INPUT' });

        setTimeout(() => {
          if (gameRoom.currentState !== 'Q_TEXT') return;
          io.to(gameRoom.hostId).emit('endTimer');
          io.to('MAIN_ROOM').emit('updatePlayerScreen', { state: 'Q_TEXT_END' });
        }, 10000);
      }, 3000);

    } else if (gameRoom.currentState === 'Q_TEXT') {
      gameRoom.currentState = 'RESULT'; 
      io.to(gameRoom.hostId).emit('updateHostScreen', {
        state: gameRoom.currentState, qIndex: gameRoom.currentQIndex,
        questionText: gameRoom.questions[gameRoom.currentQIndex], players: gameRoom.players, maxTeams: gameRoom.maxTeams
      });
      io.to('MAIN_ROOM').emit('updatePlayerScreen', { state: gameRoom.currentState });
    }
  });

  socket.on('submitAnswer', (answer) => {
    if (gameRoom && gameRoom.currentState === 'Q_TEXT') { 
      const player = gameRoom.players.find(p => p.id === socket.id);
      if (player) player.answer = answer;
    }
  });

  socket.on('changeScore', (data) => {
    const { type, target, delta } = data;
    if (!gameRoom) return;

    if (type === 'player') {
      const player = gameRoom.players.find(p => p.id === target);
      if (player) player.score += delta;
    } else if (type === 'team') {
      gameRoom.players.forEach(p => {
        if (p.team == target) p.score += delta;
      });
    }
    io.to(gameRoom.hostId).emit('updateScores', gameRoom.players);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log('게임 서버가 가동되었습니다.'));