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
      hostId: socket.id, 
      players: [],
      questions: config.questions, 
      maxTeams: config.teams,      
      currentState: 'LOBBY',
      currentQIndex: -1      
    };
    socket.join('MAIN_ROOM');
    socket.emit('gameCreated', config.teams); // 생성 시 모둠 개수 전달
  });

  socket.on('joinGame', (data) => {
    const { team, name } = data;
    if (gameRoom) {
      // 1. 해당 모둠에 현재 몇 명이 있는지 확인
      const teamPlayers = gameRoom.players.filter(p => p.team == team);
      if (teamPlayers.length >= 4) {
        socket.emit('joinError', '해당 모둠은 이미 4명이 꽉 찼습니다!');
        return;
      }

      // 2. 0번부터 3번 자리 중 비어있는 가장 빠른 자리 찾기
      let availableSlot = 0;
      for (let i = 0; i < 4; i++) {
        if (!teamPlayers.find(p => p.slot == i)) {
          availableSlot = i;
          break;
        }
      }

      // 3. 플레이어 등록 (slot 정보 추가)
      gameRoom.players.push({ id: socket.id, team, slot: availableSlot, name, answer: "" }); 
      socket.join('MAIN_ROOM');
      socket.emit('joinSuccess');
      
      // 호스트 화면(대기실 2x2 그리드) 새로고침을 위해 전체 플레이어 데이터 전송
      io.to(gameRoom.hostId).emit('updateLobby', gameRoom.players);
    }
  });

  // [신규 기능] 드래그 앤 드롭 자리 교체
  socket.on('changePlayerSlot', (data) => {
    const { playerId, newSlot } = data;
    if (!gameRoom) return;

    const player = gameRoom.players.find(p => p.id === playerId);
    if (player) {
      // 만약 이동하려는 자리에 이미 다른 학생이 있다면 자리를 맞바꿈(Swap)
      const existingPlayer = gameRoom.players.find(p => p.team == player.team && p.slot == newSlot);
      if (existingPlayer) {
        existingPlayer.slot = player.slot;
      }
      player.slot = newSlot;
      
      // 변경된 자리표를 호스트에게 다시 전송
      io.to(gameRoom.hostId).emit('updateLobby', gameRoom.players);
    }
  });

  socket.on('nextState', () => {
    if (!gameRoom) return;

    if (gameRoom.currentState === 'LOBBY' || gameRoom.currentState === 'RESULT') {
      gameRoom.currentState = 'Q_NUM'; 
      gameRoom.currentQIndex++;        
      gameRoom.players.forEach(p => p.answer = ""); 
    } else if (gameRoom.currentState === 'Q_NUM') {
      gameRoom.currentState = 'Q_TEXT'; 
    } else if (gameRoom.currentState === 'Q_TEXT') {
      gameRoom.currentState = 'RESULT'; 
    }

    io.to(gameRoom.hostId).emit('updateHostScreen', {
      state: gameRoom.currentState,
      qIndex: gameRoom.currentQIndex,
      questionText: gameRoom.questions[gameRoom.currentQIndex],
      players: gameRoom.players,
      maxTeams: gameRoom.maxTeams
    });

    io.to('MAIN_ROOM').emit('updatePlayerScreen', {
      state: gameRoom.currentState
    });
  });

  socket.on('submitAnswer', (answer) => {
    if (gameRoom) {
      const player = gameRoom.players.find(p => p.id === socket.id);
      if (player) {
        player.answer = answer;
      }
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log('게임 서버가 가동되었습니다.');
});