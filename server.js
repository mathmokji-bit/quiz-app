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
      const teamPlayers = gameRoom.players.filter(p => p.team == team);
      if (teamPlayers.length >= 4) return socket.emit('joinError', '해당 모둠은 이미 4명이 꽉 찼습니다!');

      let availableSlot = 0;
      for (let i = 0; i < 4; i++) {
        if (!teamPlayers.find(p => p.slot == i)) { availableSlot = i; break; }
      }

      gameRoom.players.push({ id: socket.id, team, slot: availableSlot, name, answer: "" }); 
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
      
      // [신규] 1단계: 문제 공개 및 3초 대기 지시
      io.to(gameRoom.hostId).emit('updateHostScreen', {
        state: gameRoom.currentState, qIndex: gameRoom.currentQIndex,
        questionText: gameRoom.questions[gameRoom.currentQIndex], players: gameRoom.players, maxTeams: gameRoom.maxTeams,
        timerState: 'PREP'
      });
      io.to('MAIN_ROOM').emit('updatePlayerScreen', { state: 'Q_TEXT_PREP' });

      // [신규] 2단계: 3초 후 실제 입력 타이머(10초) 가동
      setTimeout(() => {
        if (gameRoom.currentState !== 'Q_TEXT') return; // 그새 호스트가 버튼을 넘겼으면 취소
        io.to(gameRoom.hostId).emit('startTimer', 10);
        io.to('MAIN_ROOM').emit('updatePlayerScreen', { state: 'Q_TEXT_INPUT' });

        // [신규] 3단계: 10초 후 입력 강제 종료
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
    if (gameRoom && gameRoom.currentState === 'Q_TEXT') { // 입력 시간(Q_TEXT 상태)에만 답안 인정
      const player = gameRoom.players.find(p => p.id === socket.id);
      if (player) player.answer = answer;
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log('게임 서버가 가동되었습니다.'));