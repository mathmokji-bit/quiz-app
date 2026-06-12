const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; 
// 테스트를 위한 임시 문제 묶음
const defaultQuestions = [
  "기로 끝나는 말은?", 
  "우리 반에서 가장 키가 큰 사람은?", 
  "오늘 점심에 먹고 싶은 메뉴는?"
];

io.on('connection', (socket) => {
  
// 수정된 방 생성 로직
  socket.on('createGame', (config) => {
    // 4자리 무작위 영어/숫자 코드 생성
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // 출제자가 넘겨준 설정(문제, 모둠 수)을 방 정보에 함께 저장합니다.
    rooms[roomCode] = { 
      hostId: socket.id, 
      players: [],
      questions: config.questions, // 전달받은 문제 배열
      maxTeams: config.teams,      // 전달받은 모둠 수
      currentState: 'LOBBY',
      currentQIndex: -1      
    };
    
    socket.join(roomCode);
    socket.emit('gameCreated', roomCode);
    console.log(`새로운 방 생성됨: ${roomCode} / 문제 수: ${config.questions.length}개`);
  });

  socket.on('joinGame', (data) => {
    const { code, team, name } = data;
    const room = rooms[code];
    if (room) {
      socket.join(code);
      // 참가자 정보에 'answer' 빈칸 추가
      room.players.push({ id: socket.id, team, name, answer: "" }); 
      socket.emit('joinSuccess');
      io.to(room.hostId).emit('playerJoined', `${team}조 ${name}`);
    }
  });

  // 호스트가 '다음 단계로 진행' 버튼을 누를 때마다 실행됨
  socket.on('nextState', (code) => {
    const room = rooms[code];
    if (!room) return;

    if (room.currentState === 'LOBBY' || room.currentState === 'RESULT') {
      room.currentState = 'Q_NUM'; // "1번 문제" 화면으로
      room.currentQIndex++;        // 문제 번호 1 증가
      
      // 새 문제가 시작될 때 모든 참가자의 이전 답안 초기화
      room.players.forEach(p => p.answer = ""); 
      
    } else if (room.currentState === 'Q_NUM') {
      room.currentState = 'Q_TEXT'; // "기로 끝나는 말은?" 화면으로 (입력 시작)
    } else if (room.currentState === 'Q_TEXT') {
      room.currentState = 'RESULT'; // 정답 확인 화면으로
    }

    // 변경된 상태를 호스트와 참가자에게 각각 다르게 전송
    io.to(room.hostId).emit('updateHostScreen', {
      state: room.currentState,
      qIndex: room.currentQIndex,
      questionText: room.questions[room.currentQIndex],
      players: room.players
    });

    io.to(code).emit('updatePlayerScreen', {
      state: room.currentState
    });
  });

  // 참가자가 답을 제출했을 때
  socket.on('submitAnswer', (data) => {
    const { code, answer } = data;
    const room = rooms[code];
    if (room) {
      // 내 socket.id와 일치하는 플레이어를 찾아 답을 저장
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.answer = answer;
      }
    }
  });
});

server.listen(3000, () => {
  console.log('게임 서버가 가동되었습니다.');
});